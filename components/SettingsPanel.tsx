"use client";

import { useEffect,useMemo,useState } from "react";
import { motion } from "framer-motion";
import { Bell,Clock,FloppyDisk,Gauge,Package,ShieldCheck } from "@phosphor-icons/react";
import { getHotelBusinessDay } from "@/lib/business-day";
import RoleMatrix from "@/components/ui/RoleMatrix";

type Limit={id:string;name:string;unit:string;perRequest:number;perDay:number;perStay:number};
type ApiItem={id:string;name:string;unit:string;max_per_request:number|null;max_per_business_day:number|null;max_per_stay:number|null};

export default function SettingsPanel(){
  const [start]=useState("06:00");
  const [checkout]=useState("12:00");
  const [warn]=useState(15);
  const [critical]=useState(25);
  const [limits,setLimits]=useState<Limit[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [role,setRole]=useState<"admin"|"reception"|null>(null);

  useEffect(()=>{(async()=>{
    const [itemsResponse,userResponse]=await Promise.all([fetch("/api/request-items",{cache:"no-store"}),fetch("/api/auth/me",{cache:"no-store"})]);
    if(itemsResponse.status===401||userResponse.status===401){window.location.href="/login";return}
    const [items,user]=await Promise.all([itemsResponse.json().catch(()=>[]),userResponse.json().catch(()=>null)]);
    setRole(user?.user?.role||null);
    if(!itemsResponse.ok||!Array.isArray(items)){setError("تعذر تحميل حدود الأصناف");setLoading(false);return}
    setLimits(items.map((item:ApiItem)=>({id:item.id,name:item.name,unit:item.unit,perRequest:Number(item.max_per_request??0),perDay:Number(item.max_per_business_day??0),perStay:Number(item.max_per_stay??0)})));
    setLoading(false);
  })()},[]);

  const businessDay=useMemo(()=>getHotelBusinessDay(new Date(),{timezone:"Asia/Riyadh",startHour:6,startMinute:0}),[]);

  function updateLimit(idx:number,key:"perRequest"|"perDay"|"perStay",value:number){
    setLimits(old=>old.map((item,i)=>i===idx?{...item,[key]:Math.max(0,Number.isFinite(value)?Math.floor(value):0)}:item));setMessage("");
  }

  async function saveLimits(){
    if(role!=="admin"){setError("تعديل حدود الأصناف متاح للإدارة فقط");return}
    setSaving(true);setError("");setMessage("");
    try{
      for(const item of limits){
        const response=await fetch("/api/admin/request-items/"+encodeURIComponent(item.id),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({maxPerRequest:item.perRequest,maxPerBusinessDay:item.perDay,maxPerStay:item.perStay})});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error==="forbidden"?"ليس لديك صلاحية تعديل الحدود":"تعذر حفظ حدود "+item.name);
      }
      setMessage("تم حفظ حدود المستهلكات في قاعدة D1 وتُطبق على الطلبات الجديدة مباشرة.");
    }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ الحدود")}finally{setSaving(false)}
  }

  return <main className="settings-page">
    <header className="settings-header premium-page-head"><div><span className="section-kicker">ROOMORA ADMIN</span><h1>إعدادات التشغيل والصلاحيات</h1><p>السياسات الفعلية المستخدمة في تشغيل الفندق، مع فصل واضح بين الإعدادات القابلة للتعديل والقيم المرجعية.</p></div><button className="primary-btn" onClick={()=>void saveLimits()} disabled={saving||loading||role!=="admin"}><FloppyDisk size={18}/>{saving?"جاري الحفظ…":"حفظ حدود الأصناف"}</button></header>
    {role==="reception"?<div className="action-banner">أنت تستخدم دور موظف استقبال: يمكنك مشاهدة هذه الصفحة، لكن تعديل الحدود وإدارة المستخدمين والموافقات الإدارية غير متاح لك.</div>:null}
    {message?<div className="action-banner">{message}</div>:null}{error?<div className="login-error page-error">{error}</div>:null}

    <div className="settings-grid">
      <motion.section className="panel settings-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <div className="settings-title"><div className="settings-icon"><Clock size={20}/></div><div><h2>مرجع يوم الفندق</h2><p>القيم المستخدمة حاليًا في الواجهة والتقارير.</p></div></div>
        <div className="read-only-settings"><div><span>بداية يوم الفندق</span><b>{start}</b></div><div><span>الخروج الافتراضي</span><b>{checkout}</b></div><div><span>المنطقة الزمنية</span><b>Asia/Riyadh</b></div></div>
        <div className="business-preview"><div><span>اليوم التشغيلي الحالي</span><b>{businessDay.label}</b></div><small>هذه القيم مرجعية حاليًا وليست حقول حفظ؛ تم منع تعديلها حتى لا تعرض الواجهة إعدادًا لا يحفظ في الباك اند.</small></div>
      </motion.section>
      <motion.section className="panel settings-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.05}}>
        <div className="settings-title"><div className="settings-icon"><Gauge size={20}/></div><div><h2>SLA الطلبات</h2><p>المستويات المستخدمة في واجهة المتابعة الحالية.</p></div></div>
        <div className="read-only-settings"><div><span>تحذير</span><b>{warn} دقيقة</b></div><div><span>حرج</span><b>{critical} دقيقة</b></div></div>
        <div className="sla-bar"><span style={{width:Math.min(100,(warn/critical)*100)+"%"}}/><i>Normal</i><b>Warning</b><strong>Critical</strong></div>
      </motion.section>
    </div>

    <section className="panel limits-card">
      <div className="settings-title"><div className="settings-icon"><Package size={20}/></div><div><h2>حدود المستهلكات</h2><p>أي تجاوز يتحول لموافقة الإدارة بدل رفض الطلب.</p></div></div>
      {loading?<div className="rooms-state">جاري تحميل الأصناف…</div>:<div className="limit-table-wrap"><table className="limit-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>لكل طلب</th><th>لكل يوم فندقي</th><th>لكل إقامة</th><th>عند التجاوز</th></tr></thead><tbody>{limits.map((item,idx)=><tr key={item.id}><td><b>{item.name}</b></td><td>{item.unit}</td><td><input disabled={role!=="admin"} type="number" min="0" value={item.perRequest} onChange={e=>updateLimit(idx,"perRequest",Number(e.target.value))}/></td><td><input disabled={role!=="admin"} type="number" min="0" value={item.perDay} onChange={e=>updateLimit(idx,"perDay",Number(e.target.value))}/></td><td><input disabled={role!=="admin"} type="number" min="0" value={item.perStay} onChange={e=>updateLimit(idx,"perStay",Number(e.target.value))}/></td><td><span className="approval-chip"><ShieldCheck size={14}/> موافقة الإدارة</span></td></tr>)}</tbody></table></div>}
    </section>

    <RoleMatrix highlight={role||undefined}/>
    <section className="settings-note"><Bell size={19}/><div><b>مصدر الصلاحيات</b><p>المصفوفة أعلاه تعكس حدود الـAPI الحالية: الإدارة فقط للموافقات والمستخدمين وحدود الأصناف، بينما التشغيل اليومي متاح للاستقبال.</p></div></section>
  </main>;
}
