"use client";

import { useEffect,useMemo,useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight,Bell,Clock,FloppyDisk,Gauge,Package,ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { getHotelBusinessDay } from "@/lib/business-day";

type Limit={
  id:string;
  name:string;
  unit:string;
  perRequest:number;
  perDay:number;
  perStay:number;
};

type ApiItem={
  id:string;
  name:string;
  unit:string;
  max_per_request:number|null;
  max_per_business_day:number|null;
  max_per_stay:number|null;
};

export default function SettingsPanel(){
  const [start,setStart]=useState("06:00");
  const [checkout,setCheckout]=useState("12:00");
  const [warn,setWarn]=useState(15);
  const [critical,setCritical]=useState(25);
  const [limits,setLimits]=useState<Limit[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [role,setRole]=useState<"admin"|"reception"|null>(null);

  useEffect(()=>{(async()=>{
    const [itemsResponse,userResponse]=await Promise.all([
      fetch("/api/request-items",{cache:"no-store"}),
      fetch("/api/auth/me",{cache:"no-store"})
    ]);
    if(itemsResponse.status===401||userResponse.status===401){window.location.href="/login";return;}
    const items=await itemsResponse.json().catch(()=>[]);
    const user=await userResponse.json().catch(()=>null);
    setRole(user?.user?.role||null);
    if(!itemsResponse.ok||!Array.isArray(items)){setError("تعذر تحميل حدود الأصناف");setLoading(false);return;}
    setLimits(items.map((item:ApiItem)=>({
      id:item.id,
      name:item.name,
      unit:item.unit,
      perRequest:Number(item.max_per_request??0),
      perDay:Number(item.max_per_business_day??0),
      perStay:Number(item.max_per_stay??0)
    })));
    setLoading(false);
  })();},[]);

  const businessDay=useMemo(()=>{
    const [h,m]=start.split(":").map(Number);
    return getHotelBusinessDay(new Date(),{timezone:"Asia/Riyadh",startHour:h,startMinute:m});
  },[start]);

  function updateLimit(idx:number,key:"perRequest"|"perDay"|"perStay",value:number){
    setLimits(old=>old.map((item,i)=>i===idx?{...item,[key]:Math.max(0,Number.isFinite(value)?Math.floor(value):0)}:item));
    setMessage("");
  }

  async function saveLimits(){
    if(role!=="admin"){setError("تعديل حدود الأصناف متاح للإدارة فقط");return;}
    setSaving(true);setError("");setMessage("");
    try{
      for(const item of limits){
        const response=await fetch("/api/admin/request-items/"+encodeURIComponent(item.id),{
          method:"PATCH",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({
            maxPerRequest:item.perRequest,
            maxPerBusinessDay:item.perDay,
            maxPerStay:item.perStay
          })
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok){
          throw new Error(payload.error==="forbidden"?"ليس لديك صلاحية تعديل الحدود":"تعذر حفظ حدود "+item.name);
        }
      }
      setMessage("تم حفظ حدود جميع الأصناف في قاعدة البيانات.");
    }catch(e){
      setError(e instanceof Error?e.message:"تعذر حفظ الحدود");
    }finally{
      setSaving(false);
    }
  }

  return <div className="settings-page" dir="rtl">
    <header className="settings-header">
      <div>
        <Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link>
        <span className="section-kicker">ROOMORA ADMIN</span>
        <h1>إعدادات التشغيل</h1>
        <p>إدارة حدود طلبات الغرف وبعض إعدادات التشغيل من مكان واحد.</p>
      </div>
      <button className="primary-btn" onClick={()=>void saveLimits()} disabled={saving||loading||role!=="admin"}>
        <FloppyDisk size={18}/>{saving?"جاري الحفظ…":"حفظ حدود الأصناف"}
      </button>
    </header>

    {role==="reception"&&<div className="action-banner">عرض الإعدادات متاح، لكن تعديل حدود الأصناف متاح للإدارة فقط.</div>}
    {message&&<div className="action-banner">{message}</div>}
    {error&&<div className="login-error">{error}</div>}

    <div className="settings-grid">
      <motion.section className="panel settings-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <div className="settings-title"><div className="settings-icon"><Clock size={20}/></div><div><h2>يوم الفندق</h2><p>معاينة بداية اليوم التشغيلي الحالية.</p></div></div>
        <div className="form-grid">
          <label><span>بداية يوم الفندق</span><input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label><span>موعد الخروج الافتراضي</span><input type="time" value={checkout} onChange={e=>setCheckout(e.target.value)}/></label>
        </div>
        <div className="business-preview"><div><span>اليوم التشغيلي الحالي</span><b>{businessDay.label}</b></div><small>المنطقة الزمنية: Asia/Riyadh</small></div>
      </motion.section>

      <motion.section className="panel settings-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.05}}>
        <div className="settings-title"><div className="settings-icon"><Gauge size={20}/></div><div><h2>SLA الطلبات</h2><p>معاينة مستويات التنبيه الحالية.</p></div></div>
        <div className="form-grid">
          <label><span>تحذير بعد</span><div className="number-field"><input type="number" min="1" value={warn} onChange={e=>setWarn(Number(e.target.value))}/><em>دقيقة</em></div></label>
          <label><span>حرج بعد</span><div className="number-field"><input type="number" min={warn+1} value={critical} onChange={e=>setCritical(Number(e.target.value))}/><em>دقيقة</em></div></label>
        </div>
        <div className="sla-bar"><span style={{width:`${Math.min(100,(warn/critical)*100)}%`}}/><i>Normal</i><b>Warning</b><strong>Critical</strong></div>
      </motion.section>
    </div>

    <section className="panel limits-card">
      <div className="settings-title"><div className="settings-icon"><Package size={20}/></div><div><h2>الحد الأعلى لكل صنف</h2><p>أي كمية تتجاوز أحد الحدود تتحول تلقائيًا إلى موافقة الإدارة.</p></div></div>
      {loading?<div className="rooms-state">جاري تحميل الأصناف…</div>:
      <div className="limit-table-wrap"><table className="limit-table">
        <thead><tr><th>الصنف</th><th>الوحدة</th><th>لكل طلب</th><th>لكل يوم فندقي</th><th>لكل إقامة</th><th>عند التجاوز</th></tr></thead>
        <tbody>{limits.map((item,idx)=><tr key={item.id}>
          <td><b>{item.name}</b></td><td>{item.unit}</td>
          <td><input disabled={role!=="admin"} type="number" min="0" value={item.perRequest} onChange={e=>updateLimit(idx,"perRequest",Number(e.target.value))}/></td>
          <td><input disabled={role!=="admin"} type="number" min="0" value={item.perDay} onChange={e=>updateLimit(idx,"perDay",Number(e.target.value))}/></td>
          <td><input disabled={role!=="admin"} type="number" min="0" value={item.perStay} onChange={e=>updateLimit(idx,"perStay",Number(e.target.value))}/></td>
          <td><span className="approval-chip"><ShieldCheck size={14}/> موافقة الإدارة</span></td>
        </tr>)}</tbody>
      </table></div>}
    </section>

    <section className="settings-note"><Bell size={19}/><div><b>الحفظ الدائم</b><p>حدود الأصناف في الجدول مرتبطة الآن مباشرة بقاعدة D1 وتستخدم فورًا عند إنشاء أي طلب جديد.</p></div></section>
  </div>;
}
