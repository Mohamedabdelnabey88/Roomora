"use client";
import { fetchOperations, notifyOperationsChanged, startOperationsRefresh } from "@/lib/operations-events";

import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { requestFilterQuery, riyadhDateKey } from "@/lib/request-query";
import Link from "next/link";
import { CalendarBlank,Clock,DownloadSimple,Funnel,ListChecks,MagnifyingGlass,ShieldCheck } from "@phosphor-icons/react";
import RequestActions,{type ActiveRequest} from "@/components/RequestActions";
import RequestDetailDialog from "@/components/RequestDetailDialog";

const statusLabels:Record<string,string>={new:"جديد",acknowledged:"تم الاستلام",preparing:"جاري التجهيز",approval_required:"بانتظار موافقة",delivered:"تم التسليم",cancelled:"ملغي"};

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

  const [debouncedQuery,setDebouncedQuery]=useState("");
  const [counts,setCounts]=useState({active:0,approvals:0,late:0,completed:0});
  const [paging,setPaging]=useState<{filter:string;cursors:string[]}>({filter:"",cursors:[""]});
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const requestSequence=useRef(0);
  const today=riyadhDateKey(new Date());
  const filter=useMemo(()=>requestFilterQuery({scope,status,query:debouncedQuery,quickFilter,dateMode,dateFrom,dateTo},today),[scope,status,debouncedQuery,quickFilter,dateMode,dateFrom,dateTo,today]);
  const cursors=paging.filter===filter.query?paging.cursors:[""];
  const cursor=cursors[cursors.length-1];

  useEffect(()=>{
    const timer=window.setTimeout(()=>setDebouncedQuery(query),350);
    return()=>window.clearTimeout(timer);
  },[query]);

  const load=useCallback(async(silent=false)=>{
    const sequence=++requestSequence.current;
    if(filter.error){setRequests([]);setError(filter.error);setLoading(false);setHasMore(false);return;}
    if(!silent){setLoading(true);setHasMore(false);}
    try{
      const parameters=new URLSearchParams(filter.query);
      if(cursor)parameters.set("cursor",cursor);
      const response=await fetchOperations("/api/requests?"+parameters.toString(),{cache:"no-store"});
      if(sequence!==requestSequence.current)return;
      if(response.status===401){window.location.href="/login";return;}
      const payload=await response.json().catch(()=>null);
      if(sequence!==requestSequence.current)return;
      if(!response.ok||!Array.isArray(payload?.items)||!payload.counts)throw new Error("تعذر تحميل طلبات الغرف");
      setRequests(payload.items);setCounts(payload.counts);
      setRole(payload.role==="admin"?"admin":"reception");
      setNextCursor(payload.nextCursor||null);setHasMore(Boolean(payload.hasMore));setError("");
    }catch(error){if(sequence===requestSequence.current)setError(error instanceof Error?error.message:"تعذر تحميل طلبات الغرف");}
    finally{if(sequence===requestSequence.current)setLoading(false);}
  },[filter.query,filter.error,cursor]);

  useEffect(()=>{
    void load();
    const stop=startOperationsRefresh(()=>load(true));
    return()=>{stop();requestSequence.current++;};
  },[load]);

  async function deleteRequest(id:string){
    if(role!=="admin"||deletingId)return;
    setDeletingId(id);setDeleteError("");
    try{
      const response=await fetchOperations("/api/requests/"+encodeURIComponent(id),{method:"DELETE"});
      const payload=await response.json().catch(()=>({}));
      const map:Record<string,string>={
        forbidden:"الحذف النهائي متاح لمدير النظام فقط.",
        request_not_found:"الطلب لم يعد موجودًا.",
        backend_unreachable:"تعذر الاتصال بخدمة Roomora الخلفية."
      };
      if(!response.ok)throw new Error(map[payload.error]||"تعذر حذف الطلب نهائيًا.");
      setDeleteConfirmId(null);
      if(detailId===id)setDetailId(null);
      notifyOperationsChanged();
      await load(true);
    }catch(e){
      setDeleteError(e instanceof Error?e.message:"تعذر حذف الطلب نهائيًا.");
    }finally{
      setDeletingId(null);
    }
  }

  const ageMinutes=(value:string)=>Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
  const age=(value:string)=>{const m=ageMinutes(value);return m<1?"الآن":m<60?"منذ "+m+" د":"منذ "+Math.floor(m/60)+" س"};

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

  const filtered=requests;

  return <main className="settings-page requests-page">
    <header className="settings-header premium-page-head"><div><span className="section-kicker">SERVICE DESK</span><h1>مركز طلبات الغرف</h1><p>لوحة تشغيل لحظية من تسجيل الطلب حتى التسليم، مع SLA وموافقات الإدارة.</p></div><div className="live-badge"><i/> تحديث عند التغيير وكل دقيقة</div></header>

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
      <div className="requests-history-result"><b>{filtered.length}</b><span>طلب في هذه الصفحة</span></div>
      <Link href="/reports" className="reports-shortcut"><DownloadSimple size={16}/> التقارير والتصدير</Link>
    </section>

    <section className="panel requests-directory premium-directory" aria-busy={loading}>
      <div className="directory-toolbar pro-toolbar">
        <div className="search wide"><MagnifyingGlass size={18}/><input maxLength={80} value={query} onChange={e=>{setQuery(e.target.value);setQuickFilter(null)}} placeholder="بحث بالغرفة، النزيل أو الصنف…"/></div>
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
      <div className="directory-toolbar" aria-label="صفحات سجل الطلبات">
        <button type="button" className="secondary-btn" disabled={loading||cursors.length===1} onClick={()=>setPaging({filter:filter.query,cursors:cursors.slice(0,-1)})}>السابق</button>
        <span aria-live="polite">صفحة {cursors.length} · حتى 25 طلبًا</span>
        <button type="button" className="secondary-btn" disabled={loading||!hasMore||!nextCursor} onClick={()=>{if(nextCursor)setPaging({filter:filter.query,cursors:[...cursors,nextCursor]})}}>التالي</button>
      </div>
    </section>
    <RequestDetailDialog requestId={detailId} role={role} onClose={()=>setDetailId(null)} onDeleted={async()=>{setDetailId(null);notifyOperationsChanged();await load(true)}}/>
  </main>;
}
