"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Funnel, ListChecks, MagnifyingGlass, ShieldCheck } from "@phosphor-icons/react";
import RequestActions, { type ActiveRequest } from "@/components/RequestActions";

const statusLabels:Record<string,string>={
  new:"جديد",
  acknowledged:"تم الاستلام",
  preparing:"جاري التجهيز",
  approval_required:"بانتظار موافقة",
  delivered:"تم التسليم",
  cancelled:"ملغي"
};

export default function RequestsPanel() {
  const [requests,setRequests]=useState<ActiveRequest[]>([]);
  const [role,setRole]=useState<"admin"|"reception"|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [scope,setScope]=useState("active");

  async function load() {
    setLoading(true);
    const [requestResponse,userResponse]=await Promise.all([
      fetch("/api/requests?scope=all",{cache:"no-store"}),
      fetch("/api/auth/me",{cache:"no-store"})
    ]);
    if (requestResponse.status===401 || userResponse.status===401) { window.location.href="/login"; return; }

    const requestPayload=await requestResponse.json().catch(()=>[]);
    const userPayload=await userResponse.json().catch(()=>null);

    if (!requestResponse.ok || !Array.isArray(requestPayload)) {
      setError("تعذر تحميل طلبات الغرف");
      setLoading(false);
      return;
    }

    setRequests(requestPayload);
    setRole(userPayload?.user?.role || null);
    setError("");
    setLoading(false);
  }

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(),30000);
    return()=>window.clearInterval(timer);
  },[]);

  function ageMinutes(value:string) {
    const ms=new Date(value).getTime();
    if (!Number.isFinite(ms)) return 0;
    return Math.max(0,Math.floor((Date.now()-ms)/60000));
  }

  function age(value:string) {
    const mins=ageMinutes(value);
    if (mins<1) return "الآن";
    if (mins<60) return "منذ "+mins+" د";
    return "منذ "+Math.floor(mins/60)+" س";
  }

  const filtered=useMemo(()=>requests.filter(item=>{
    const q=query.trim();
    const text=(item.room_number+" "+item.guest_name+" "+item.items).toLowerCase();
    const effectiveScope = q ? "all" : scope;
    const scopeMatch = effectiveScope==="all" || (effectiveScope==="active" ? !["delivered","cancelled"].includes(item.status) : ["delivered","cancelled"].includes(item.status));
    return scopeMatch && (status==="all" || item.status===status) && (!q || text.includes(q.toLowerCase()));
  }),[requests,query,status,scope]);

  return <main className="settings-page requests-page">
    <header className="settings-header">
      <div>
        <Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link>
        <span className="section-kicker">SERVICE DESK</span>
        <h1>طلبات الغرف</h1>
        <p>متابعة الطلب من لحظة التسجيل وحتى التسليم أو قرار الإدارة.</p>
      </div>
    </header>

    <section className="request-kpis">
      <div><ListChecks size={19}/><span>النشطة</span><b>{requests.length}</b></div>
      <div><ShieldCheck size={19}/><span>تحتاج موافقة</span><b>{requests.filter(r=>r.status==="approval_required").length}</b></div>
      <div><Clock size={19}/><span>متأخرة +15 د</span><b>{requests.filter(r=>ageMinutes(r.requested_at)>=15).length}</b></div>
    </section>

    <section className="panel requests-directory">
      <div className="directory-toolbar">
        <div className="search wide"><MagnifyingGlass size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بالغرفة أو النزيل أو الصنف"/></div>
        <div className="filter-select"><Funnel size={16}/><select value={scope} onChange={e=>setScope(e.target.value)}>
          <option value="active">الطلبات النشطة</option><option value="completed">المكتملة والملغاة</option><option value="all">كل السجل</option>
        </select><select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="all">كل الحالات</option>
          <option value="new">جديد</option>
          <option value="acknowledged">تم الاستلام</option>
          <option value="preparing">جاري التجهيز</option>
          <option value="approval_required">بانتظار موافقة</option>
          <option value="delivered">تم التسليم</option>
          <option value="cancelled">ملغي</option>
        </select></div>
      </div>
      {query.trim() && <div className="search-scope-note">البحث الحالي يشمل كل سجل الطلبات، بما فيه الطلبات المسلّمة والملغاة.</div>}

      {loading ? <div className="rooms-state">جاري تحميل الطلبات…</div> :
      error ? <div className="rooms-state error">{error}</div> :
      filtered.length===0 ? <div className="rooms-state">لا توجد طلبات مطابقة.</div> :
      <div className="request-board">{filtered.map(item=>{
        const mins=ageMinutes(item.requested_at);
        const sla=mins>=25?"critical":mins>=15?"warning":"normal";
        return <article className={"request-card "+sla} key={item.id}>
          <div className="request-card-head"><div><b>غرفة {item.room_number}</b><span>{item.guest_name}</span></div><i>{age(item.requested_at)}</i></div>
          <p>{item.items || "طلب غرفة"}</p>
          <div className="request-card-meta"><span className={"table-status "+item.status}>{statusLabels[item.status] || item.status}</span><small>{mins>=25?"حرج":mins>=15?"تحذير":"ضمن SLA"}</small></div>
          {item.approval_reason && <div className="approval-reason">{item.approval_reason}</div>}
          <RequestActions request={item} role={role} onChanged={load}/>
        </article>;
      })}</div>}
    </section>
  </main>;
}
