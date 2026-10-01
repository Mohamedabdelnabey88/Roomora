"use client";

import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { Bell,CalendarCheck,Clock,ListChecks,ShieldCheck,WarningCircle } from "@phosphor-icons/react";
import type { ApiRoom,Room } from "@/lib/data";
import { mapApiRoom } from "@/lib/data";
import type { ActiveRequest } from "@/components/RequestActions";

type Notice={
  id:string;
  category:"checkout"|"request"|"approval";
  tone:"warning"|"critical";
  title:string;
  body:string;
  timeLabel:string;
  href:string;
};

export default function NotificationsCenter(){
  const [rooms,setRooms]=useState<Room[]>([]);
  const [requests,setRequests]=useState<ActiveRequest[]>([]);
  const [loading,setLoading]=useState(true);
  const [now,setNow]=useState(Date.now());

  async function load(silent=false){
    if(!silent)setLoading(true);
    const [rr,rq]=await Promise.all([
      fetch("/api/rooms",{cache:"no-store"}),
      fetch("/api/requests?scope=all",{cache:"no-store"})
    ]);
    if(rr.status===401||rq.status===401){window.location.href="/login";return}
    const [roomsPayload,requestsPayload]=await Promise.all([rr.json().catch(()=>[]),rq.json().catch(()=>[])]);
    if(Array.isArray(roomsPayload))setRooms((roomsPayload as ApiRoom[]).map(mapApiRoom));
    if(Array.isArray(requestsPayload))setRequests(requestsPayload);
    if(!silent)setLoading(false);
  }

  useEffect(()=>{
    void load();
    const refresh=()=>void load(true);
    const poll=window.setInterval(refresh,30000);
    const clock=window.setInterval(()=>setNow(Date.now()),60000);
    const visible=()=>{if(document.visibilityState==="visible")refresh()};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",visible);
    return()=>{window.clearInterval(poll);window.clearInterval(clock);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",visible)}
  },[]);

  const notices=useMemo<Notice[]>(()=>{
    const result:Notice[]=[];
    for(const room of rooms){
      if(!room.stayId||!room.expectedCheckoutAt)continue;
      const expected=new Date(room.expectedCheckoutAt).getTime();
      if(!Number.isFinite(expected))continue;
      const diff=Math.ceil((expected-now)/60000);
      if(diff<=15){
        if(diff>0)result.push({
          id:"checkout-"+room.stayId,category:"checkout",tone:"warning",
          title:"موعد خروج قريب",
          body:"الغرفة "+room.number+" · "+(room.guest||"نزيل")+" · متبقي "+diff+" دقيقة",
          timeLabel:"قبل موعد الخروج",href:"/guests?view=checkout-today"
        });
        else{
          const late=Math.max(0,Math.floor((now-expected)/60000));
          result.push({
            id:"checkout-"+room.stayId,category:"checkout",tone:"critical",
            title:"تجاوز وقت الخروج",
            body:"الغرفة "+room.number+" · "+(room.guest||"نزيل")+" · تأخير "+late+" دقيقة",
            timeLabel:"يحتاج خروج أو تمديد",href:"/guests?view=checkout-today"
          });
        }
      }
    }

    for(const request of requests){
      if(["delivered","cancelled"].includes(request.status))continue;
      const age=Math.max(0,Math.floor((now-new Date(request.requested_at).getTime())/60000));
      if(request.status==="approval_required"){
        result.push({
          id:"approval-"+request.id,category:"approval",tone:"warning",
          title:"طلب يحتاج موافقة",
          body:"الغرفة "+request.room_number+" · "+(request.items||"طلب غرفة"),
          timeLabel:"بانتظار الإدارة",href:"/requests"
        });
      }else if(age>=15){
        result.push({
          id:"request-"+request.id,category:"request",tone:age>=25?"critical":"warning",
          title:age>=25?"طلب متأخر بشكل حرج":"طلب متأخر",
          body:"الغرفة "+request.room_number+" · "+(request.items||"طلب غرفة"),
          timeLabel:"منذ "+age+" دقيقة",href:"/requests"
        });
      }
    }

    return result.sort((a,b)=>{
      const rank=(x:Notice)=>x.tone==="critical"?0:1;
      return rank(a)-rank(b);
    });
  },[rooms,requests,now]);

  const counts={
    total:notices.length,
    critical:notices.filter(n=>n.tone==="critical").length,
    checkout:notices.filter(n=>n.category==="checkout").length,
    approvals:notices.filter(n=>n.category==="approval").length
  };

  const iconFor=(n:Notice)=>n.category==="checkout"?<CalendarCheck size={20}/>:n.category==="approval"?<ShieldCheck size={20}/>:<ListChecks size={20}/>;

  return <main className="settings-page notifications-page">
    <header className="settings-header premium-page-head">
      <div><span className="section-kicker">OPERATIONS ALERT CENTER</span><h1>مركز الإشعارات</h1><p>كل التنبيهات التشغيلية التي تحتاج متابعة من الاستقبال أو الإدارة في مكان واحد.</p></div>
      <div className="live-badge"><i/> تحديث تلقائي كل 30 ثانية</div>
    </header>

    <section className="notification-kpis">
      <div><Bell size={20}/><span>كل التنبيهات</span><b>{counts.total}</b></div>
      <div className="critical"><WarningCircle size={20}/><span>حرجة</span><b>{counts.critical}</b></div>
      <div><CalendarCheck size={20}/><span>تنبيهات الخروج</span><b>{counts.checkout}</b></div>
      <div><ShieldCheck size={20}/><span>طلبات موافقة</span><b>{counts.approvals}</b></div>
    </section>

    <section className="panel notification-center-panel">
      <div className="panel-head"><div><span className="section-kicker">LIVE ALERTS</span><h2>التنبيهات الحالية</h2></div></div>
      {loading?<div className="rooms-state">جاري تحميل الإشعارات…</div>:notices.length===0?<div className="empty-pro-state"><Bell size={30}/><b>لا توجد تنبيهات تحتاج متابعة</b><span>سيظهر هنا أي خروج قريب، تأخير، أو طلب يحتاج تدخل.</span></div>:
      <div className="notification-center-list">{notices.map(n=><Link href={n.href} key={n.id} className={"notification-center-row "+n.tone}>
        <div className="notification-center-icon">{iconFor(n)}</div>
        <div className="notification-center-copy"><span>{n.category==="checkout"?"الإقامات":n.category==="approval"?"الموافقات":"طلبات الغرف"}</span><b>{n.title}</b><p>{n.body}</p></div>
        <div className="notification-center-meta"><Clock size={13}/>{n.timeLabel}</div>
      </Link>)}</div>}
    </section>
  </main>;
}
