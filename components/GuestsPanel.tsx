"use client";
import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { ArrowRight,MagnifyingGlass,Phone,Users } from "@phosphor-icons/react";

type StayRow={
  id:string; guest_name:string; guest_phone?:string|null; status:string;
  checkin_at:string; expected_checkout_at:string; actual_checkout_at?:string|null;
  room_number:string; room_type:string; total_requests:number; open_requests:number;
};

export default function GuestsPanel(){
  const [rows,setRows]=useState<StayRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [q,setQ]=useState("");
  const [scope,setScope]=useState("all");

  useEffect(()=>{(async()=>{
    const r=await fetch("/api/stays",{cache:"no-store"});
    if(r.status===401){window.location.href="/login";return;}
    const p=await r.json().catch(()=>[]);
    if(!r.ok||!Array.isArray(p)){setError("تعذر تحميل سجل النزلاء");setLoading(false);return;}
    setRows(p);setLoading(false);
  })();},[]);

  const filtered=useMemo(()=>rows.filter(x=>{
    const text=(x.guest_name+" "+(x.guest_phone||"")+" "+x.room_number).toLowerCase();
    return (scope==="all"||x.status===scope)&&(!q||text.includes(q.toLowerCase()));
  }),[rows,q,scope]);

  function d(v?:string|null){if(!v)return "—";return new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v));}
  function phone(v?:string|null){if(!v)return "غير مسجل";const s=v.replace(/\s+/g,"");return s.length>5?s.slice(0,2)+"•••••"+s.slice(-3):"••••";}

  return <main className="settings-page">
    <header className="settings-header"><div><Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link><span className="section-kicker">GUEST DIRECTORY</span><h1>النزلاء والإقامات</h1><p>السجل الحالي والتاريخي للنزلاء المرتبط بالإقامات والغرف.</p></div></header>
    <section className="panel rooms-directory">
      <div className="directory-toolbar"><div className="search wide"><MagnifyingGlass size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث باسم النزيل أو الجوال أو الغرفة"/></div><select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">كل الإقامات</option><option value="in_house">داخل الفندق</option><option value="checked_out">غادر</option><option value="cancelled">ملغاة</option></select></div>
      {loading?<div className="rooms-state">جاري تحميل النزلاء…</div>:error?<div className="rooms-state error">{error}</div>:
      <div className="rooms-table-wrap"><table className="rooms-table"><thead><tr><th>النزيل</th><th>الغرفة</th><th>الحالة</th><th>الدخول</th><th>الخروج المتوقع</th><th>الخروج الفعلي</th><th>الطلبات</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td><b>{x.guest_name}</b><small><Phone size={11}/> {phone(x.guest_phone)}</small></td><td><b>{x.room_number}</b><small>{x.room_type}</small></td><td><span className={"table-status "+(x.status==="in_house"?"occupied":"available")}>{x.status==="in_house"?"داخل الفندق":x.status==="checked_out"?"غادر":"ملغاة"}</span></td><td>{d(x.checkin_at)}</td><td>{d(x.expected_checkout_at)}</td><td>{d(x.actual_checkout_at)}</td><td>{x.total_requests||0}{Number(x.open_requests||0)>0?<small>{x.open_requests} مفتوح</small>:null}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
