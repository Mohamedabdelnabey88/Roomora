"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bed, CalendarBlank, CheckCircle, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { mapApiRoom, type ApiRoom, type Room } from "@/lib/data";
import { CheckinDialog, ExtendStayDialog } from "@/components/StayDialogs";
import RequestDialog from "@/components/RequestDialog";

const labels = {
  available:"متاحة",
  occupied:"مشغولة",
  checkout:"خروج اليوم",
  request:"طلب مفتوح",
  cleaning:"تنظيف",
  maintenance:"صيانة"
} as const;

export default function RoomsPanel() {
  const [rooms,setRooms]=useState<Room[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<"all"|Room["status"]>("all");
  const [checkinRoom,setCheckinRoom]=useState<Room|null>(null);
  const [extendRoom,setExtendRoom]=useState<Room|null>(null);
  const [requestRoom,setRequestRoom]=useState<Room|null>(null);
  const [message,setMessage]=useState("");

  async function load() {
    setLoading(true);
    const response=await fetch("/api/rooms",{cache:"no-store"});
    if (response.status===401) { window.location.href="/login"; return; }
    const payload=await response.json().catch(()=>[]);
    if (!response.ok || !Array.isArray(payload)) {
      setError("تعذر تحميل الغرف والإقامات");
      setLoading(false);
      return;
    }
    setRooms(payload.map(mapApiRoom));
    setError("");
    setLoading(false);
  }

  useEffect(()=>{ void load(); },[]);

  const filtered=useMemo(()=>rooms.filter(room=>{
    const matchesStatus=status==="all" || room.status===status;
    const q=query.trim();
    const matchesQuery=!q || room.number.includes(q) || (room.guest||"").includes(q);
    return matchesStatus && matchesQuery;
  }),[rooms,query,status]);

  function formatDate(value?:string) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("ar-SA",{
      timeZone:"Asia/Riyadh",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"
    }).format(new Date(value));
  }

  async function checkout(room:Room) {
    if (!room.stayId) return;
    if (!window.confirm("تأكيد تسجيل خروج النزيل من الغرفة "+room.number+"؟")) return;
    const response=await fetch("/api/stays/"+encodeURIComponent(room.stayId)+"/checkout",{method:"POST"});
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) {
      if (payload.error==="open_requests_exist") setMessage("لا يمكن تسجيل الخروج قبل إغلاق الطلبات المفتوحة ("+String(payload.count||0)+").");
      else setMessage("تعذر تسجيل الخروج.");
      return;
    }
    setMessage("تم تسجيل خروج النزيل بنجاح.");
    await load();
  }

  return <main className="settings-page rooms-page">
    <header className="settings-header">
      <div>
        <Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link>
        <span className="section-kicker">ROOMS & STAYS</span>
        <h1>الغرف والإقامات</h1>
        <p>إدارة حالة الغرف والإقامة الحالية من شاشة تشغيل واحدة.</p>
      </div>
    </header>

    <section className="panel rooms-directory">
      <div className="directory-toolbar">
        <div className="search wide"><MagnifyingGlass size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث برقم الغرفة أو اسم النزيل"/></div>
        <select value={status} onChange={e=>setStatus(e.target.value as typeof status)}>
          <option value="all">كل الحالات</option>
          {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {message && <div className="action-banner">{message}</div>}
      {loading ? <div className="rooms-state">جاري تحميل الغرف…</div> :
      error ? <div className="rooms-state error">{error}</div> :
      <div className="rooms-table-wrap">
        <table className="rooms-table">
          <thead><tr><th>الغرفة</th><th>النوع</th><th>الحالة</th><th>النزيل الحالي</th><th>الخروج المتوقع</th><th>طلبات مفتوحة</th><th>الإجراءات</th></tr></thead>
          <tbody>{filtered.map(room=><tr key={room.id}>
            <td><b>{room.number}</b><small>الدور {room.floor===0?"الأرضي":room.floor}</small></td>
            <td>{room.type}</td>
            <td><span className={"table-status "+room.status}>{labels[room.status]}</span></td>
            <td>{room.guest || "—"}</td>
            <td>{formatDate(room.expectedCheckoutAt)}</td>
            <td>{room.openRequests || 0}</td>
            <td><div className="table-actions">
              {room.guest ? <>
                <button onClick={()=>setRequestRoom(room)}><Plus size={14}/> طلب</button>
                <button onClick={()=>setExtendRoom(room)}><CalendarBlank size={14}/> تمديد</button>
                <button className="danger" onClick={()=>void checkout(room)}>خروج</button>
              </> : room.status==="available" ? <button onClick={()=>setCheckinRoom(room)}><CheckCircle size={14}/> تسكين</button> : <span>—</span>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <CheckinDialog room={checkinRoom} onClose={()=>setCheckinRoom(null)} onSuccess={load}/>
    <ExtendStayDialog room={extendRoom} onClose={()=>setExtendRoom(null)} onSuccess={load}/>
    <RequestDialog room={requestRoom} onClose={()=>setRequestRoom(null)} onSuccess={async()=>{setMessage("تم تسجيل الطلب.");await load();}}/>
  </main>;
}
