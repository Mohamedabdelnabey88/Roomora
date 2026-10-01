"use client";

import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { CalendarBlank,Clock,DownloadSimple,Funnel,ListChecks,MagnifyingGlass,ShieldCheck } from "@phosphor-icons/react";
import RequestActions,{type ActiveRequest} from "@/components/RequestActions";
import RequestDetailDialog from "@/components/RequestDetailDialog";
import { subscribeOperationsChanged } from "@/lib/operations-events";

const statusLabels:Record<string,string>={new:"جديد",acknowledged:"تم الاستلام",preparing:"جاري التجهيز",approval_required:"بانتظار موافقة",delivered:"تم التسليم",cancelled:"ملغي"};
const activeStatuses=new Set(["new","acknowledged","preparing","approval_required"]);

export default function RequestsPanel(){
  const [requests,setRequests]=useState<ActiveRequest[]>([]);
  const [role,setRole]=useState<"admin"|"reception"|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [scope,setScope]=useState<"active"|"completed"|"all">("active");
  const [quickFilter,setQuickFilter]=useState<"active"|"approvals"|"late"|"completed"|null>("active");
  const [detailId,setDetailId]=useState<string|null>(null);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [deleteConfirmId,setDeleteConfirmId]=useState<string|null>(null);
  const [deleteError,setDeleteError]=useState("");
  const [dateMode,setDateMode]=useState<"all"|"today"|"yesterday"|"month"|"custom">("all");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");

  async function load(silent=false){
    if(!silent)setLoading(true);
    try{
      const [rr,ur]=await Promise.all([fetch("/api/requests?scope=all",{cache:"no-store"}),fetch("/api/auth/me",{cache:"no-store"})]);
      if(rr.status===401||ur.status===401){window.location.href="/login";return}
      const [rp,up]=await Promise.all([rr.json().catch(()=>[]),ur.json().catch(()=>null)]);
      if(!rr.ok||!Array.isArray(rp))throw new Error("تعذر تحميل طلبات الغرف");
      setRequests(rp);setRole(up?.user?.role||null);setError("");
    }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل طلبات الغرف")}
    finally{if(!silent)setLoading(false)}
  }

  useEffect(()=>{
    void load();
    const refresh=()=>void load(true);
    const timer=window.setInterval(refresh,15000);
    const unsubscribe=subscribeOperationsChanged(refresh);
    window.addEventListener("focus",refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);unsubscribe()}
  },[]);

  async function deleteRequest(id:string){
    if(role!=="admin"||deletingId)return;
    setDeletingId(id);setDeleteError("");
    try{
      const response=await fetch("/api/requests/"+encodeURIComponent(id),{method:"DELETE"});
      const payload=await response.json().catch(()=>({}));
      const map:Record<string,string>={
        forbidden:"الحذف النهائي متاح لمدير النظام فقط.",
        request_not_found:"الطلب لم يعد موجودًا.",
        backend_unreachable:"تعذر الاتصال بخدمة Roomora الخلفية."
      };
      if(!response.ok)throw new Error(map[payload.error]||"تعذر حذف الطلب نهائيًا.");
      setDeleteConfirmId(null);
      if(detailId===id)setDetailId(null);
      await load(true);
    }catch(e){
      setDeleteError(e instanceof Error?e.message:"تعذر حذف الطلب نهائيًا.");
    }finally{
      setDeletingId(null);
    }
  }

  function riyadhDateKey(value:string|Date){
    const date=typeof value==="string"?new Date(value):value;
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const read=(type:string)=>parts.find(p=>p.type===type)?.value||"";
    return read("year")+"-"+read("month")+"-"+read("day");
  }

  function dayOffset(days:number){
    const key=riyadhDateKey(new Date());
    const d=new Date(key+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
  }

  function dateMatches(value:string){
    if(dateMode==="all")return true;
    const key=riyadhDateKey(value);
    if(dateMode==="today")return key===dayOffset(0);
    if(dateMode==="yesterday")return key===dayOffset(-1);
    if(dateMode==="month")return key.slice(0,7)===dayOffset(0).slice(0,7);
    if(dateMode==="custom"){
      if(dateFrom&&key<dateFrom)return false;
      if(dateTo&&key>dateTo)return false;
      return Boolean(dateFrom||dateTo);
    }
    return true;
  }

  const ageMinutes=(value:string)=>Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
  const age=(value:string)=>{const m=ageMinutes(value);return m<1?"الآن":m<60?"منذ "+m+" د":"منذ "+Math.floor(m/60)+" س"};

  const counts=useMemo(()=>({
    active:requests.filter(r=>activeStatuses.has(r.status)).length,
    approvals:requests.filter(r=>r.status==="approval_required").length,
    late:requests.filter(r=>activeStatuses.has(r.status)&&ageMinutes(r.requested_at)>=15).length,
    completed:requests.filter(r=>["delivered","cancelled"].includes(r.status)).length
  }),[requests]);

  function applyQuickFilter(filter:"active"|"approvals"|"late"|"completed"){
    setQuickFilter(filter);
    setQuery("");
    if(filter==="active"){
      setScope("active");
      setStatus("all");
    }else if(filter==="approvals"){
      setScope("active");
      setStatus("approval_required");
    }else if(filter==="late"){
      setScope("active");
      setStatus("all");
    }else{
      setScope("completed");
      setStatus("all");
    }
  }

  const filtered=useMemo(()=>requests.filter(item=>{
    const q=query.trim().toLowerCase();
    const scopeMatch=scope==="all"||(scope==="active"?activeStatuses.has(item.status):["delivered","cancelled"].includes(item.status));
    const statusMatch=status==="all"||item.status===status;
    const lateMatch=quickFilter!=="late"||(activeStatuses.has(item.status)&&ageMinutes(item.requested_at)>=15);
    const text=(item.room_number+" "+item.guest_name+" "+item.items).toLowerCase();
    return scopeMatch&&statusMatch&&lateMatch&&dateMatches(item.requested_at)&&(!q||text.includes(q));
  }),[requests,query,status,scope,quickFilter,dateMode,dateFrom,dateTo]);

  return <main className="settings-page requests-page">
    <header className="settings-header premium-page-head"><div><span className="section-kicker">SERVICE DESK</span><h1>مركز طلبات الغرف</h1><p>لوحة تشغيل لحظية من تسجيل الطلب حتى التسليم، مع SLA وموافقات الإدارة.</p></div><div className="live-badge"><i/> تحديث تلقائي كل 15 ثانية</div></header>

    <section className="request-kpis premium-kpis" aria-label="فلاتر الطلبات السريعة">
      <button type="button" aria-pressed={quickFilter==="active"} className={quickFilter==="active"?"active":""} onClick={()=>applyQuickFilter("active")}><ListChecks size={20}/><span>قيد التنفيذ</span><b>{counts.active}</b><small>طلبات تحتاج متابعة</small></button>
      <button type="button" aria-pressed={quickFilter==="approvals"} className={quickFilter==="approvals"?"active":""} onClick={()=>applyQuickFilter("approvals")}><ShieldCheck size={20}/><span>موافقات</span><b>{counts.approvals}</b><small>بانتظار الإدارة</small></button>
      <button type="button" aria-pressed={quickFilter==="late"} className={quickFilter==="late"?"active":""} onClick={()=>applyQuickFilter("late")}><Clock size={20}/><span>متأخرة</span><b>{counts.late}</b><small>أكثر من 15 دقيقة</small></button>
      <button type="button" aria-pressed={quickFilter==="completed"} className={quickFilter==="completed"?"active":""} onClick={()=>applyQuickFilter("completed")}><ListChecks size={20}/><span>السجل المكتمل</span><b>{counts.completed}</b><small>تسليم أو إلغاء</small></button>
    </section>

    <section className="requests-history-bar">
      <div className="requests-history-copy"><CalendarBlank size={18}/><div><b>سجل الطلبات حسب التاريخ</b><span>راجع طلبات اليوم أو أمس أو الشهر، أو اختر فترة محددة.</span></div></div>
      <div className="requests-date-tabs">
        <button className={dateMode==="today"?"active":""} onClick={()=>setDateMode("today")}>اليوم</button>
        <button className={dateMode==="yesterday"?"active":""} onClick={()=>setDateMode("yesterday")}>أمس</button>
        <button className={dateMode==="month"?"active":""} onClick={()=>setDateMode("month")}>هذا الشهر</button>
        <button className={dateMode==="custom"?"active":""} onClick={()=>setDateMode("custom")}>فترة محددة</button>
        <button className={dateMode==="all"?"active":""} onClick={()=>setDateMode("all")}>كل السجل</button>
      </div>
      {dateMode==="custom"?<div className="requests-custom-range"><label>من<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>إلى<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label></div>:null}
      <div className="requests-history-result"><b>{filtered.length}</b><span>طلب مطابق</span></div>
      <Link href="/reports" className="reports-shortcut"><DownloadSimple size={16}/> التقارير والتصدير</Link>
    </section>

    <section className="panel requests-directory premium-directory">
      <div className="directory-toolbar pro-toolbar">
        <div className="search wide"><MagnifyingGlass size={18}/><input value={query} onChange={e=>{setQuery(e.target.value);setQuickFilter(null)}} placeholder="بحث بالغرفة، النزيل أو الصنف…"/></div>
        <div className="filter-select"><Funnel size={16}/><select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setQuickFilter(null)}}><option value="active">قيد التنفيذ</option><option value="completed">المكتملة والملغاة</option><option value="all">كل السجل</option></select><select value={status} onChange={e=>{setStatus(e.target.value);setQuickFilter(null)}}><option value="all">كل الحالات</option>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      </div>

      {loading?<div className="rooms-state">جاري تحميل الطلبات…</div>:error?<div className="rooms-state error">{error}</div>:filtered.length===0?<div className="empty-pro-state"><ListChecks size={28}/><b>لا توجد طلبات مطابقة</b><span>جرّب تغيير الفلاتر أو البحث.</span></div>:
      <div className="request-board premium-request-board">{filtered.map(item=>{
        const mins=ageMinutes(item.requested_at);
        const sla=mins>=25?"critical":mins>=15?"warning":"normal";
        return <article className={"request-card premium-request-card "+sla} key={item.id}>
          <header><div className="request-room"><span>غرفة</span><b>{item.room_number}</b></div><div className="request-age"><Clock size={14}/>{age(item.requested_at)}</div></header>
          <div className="request-person"><span>النزيل</span><b>{item.guest_name}</b></div>
          <div className="request-items-copy">{item.items||"طلب غرفة"}</div>
          <div className="request-state-row"><span className={"table-status "+item.status}>{statusLabels[item.status]||item.status}</span><small className={"sla-chip "+sla}>{sla==="critical"?"حرج":sla==="warning"?"تنبيه":"ضمن SLA"}</small></div>
          {item.approval_reason?<div className="approval-reason"><ShieldCheck size={14}/>{item.approval_reason}</div>:null}
          <div className="request-card-footer">
            <button className="detail-button" onClick={()=>setDetailId(item.id)}>التفاصيل الكاملة</button>
            <RequestActions request={item} role={role} onChanged={()=>load(true)}/>
            {role==="admin"?<div className="card-delete-zone">
              {deleteConfirmId!==item.id
                ?<button type="button" className="card-delete-btn" onClick={()=>{setDeleteError("");setDeleteConfirmId(item.id)}}>حذف الطلب نهائيًا</button>
                :<div className="card-delete-confirm">
                  <span>تأكيد حذف الطلب نهائيًا؟</span>
                  <div><button type="button" onClick={()=>setDeleteConfirmId(null)} disabled={deletingId===item.id}>تراجع</button><button type="button" className="danger" onClick={()=>void deleteRequest(item.id)} disabled={deletingId===item.id}>{deletingId===item.id?"جاري الحذف…":"نعم، حذف"}</button></div>
                </div>}
              {deleteError&&deleteConfirmId===item.id?<div className="inline-action-error">{deleteError}</div>:null}
            </div>:null}
          </div>
        </article>
      })}</div>}
    </section>
    <RequestDetailDialog requestId={detailId} role={role} onClose={()=>setDetailId(null)} onDeleted={async()=>{setDetailId(null);await load(true)}}/>
  </main>;
}
