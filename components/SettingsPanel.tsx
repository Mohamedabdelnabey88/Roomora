"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Clock, FloppyDisk, Gauge, Package, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { getHotelBusinessDay } from "@/lib/business-day";

type Limit = { name:string; perRequest:number; perDay:number; perStay:number };

const initialLimits: Limit[] = [
  { name:"مياه", perRequest:6, perDay:12, perStay:30 },
  { name:"مخدة", perRequest:2, perDay:2, perStay:4 },
  { name:"بطانية", perRequest:1, perDay:2, perStay:3 },
  { name:"شرشف", perRequest:2, perDay:3, perStay:6 },
  { name:"منشفة", perRequest:4, perDay:6, perStay:12 },
  { name:"فرشاة أسنان", perRequest:2, perDay:4, perStay:8 },
  { name:"صابون", perRequest:3, perDay:4, perStay:10 },
  { name:"شامبو", perRequest:3, perDay:4, perStay:10 }
];

export default function SettingsPanel() {
  const [start, setStart] = useState("06:00");
  const [checkout, setCheckout] = useState("12:00");
  const [warn, setWarn] = useState(15);
  const [critical, setCritical] = useState(25);
  const [limits, setLimits] = useState(initialLimits);
  const [saved, setSaved] = useState(false);

  const businessDay = useMemo(() => {
    const [h,m] = start.split(":").map(Number);
    return getHotelBusinessDay(new Date(), { timezone:"Asia/Riyadh", startHour:h, startMinute:m });
  }, [start]);

  const updateLimit = (idx:number,key:keyof Omit<Limit,"name">,value:number) => {
    setLimits(old => old.map((item,i) => i === idx ? { ...item, [key]: Math.max(0, value || 0) } : item));
    setSaved(false);
  };

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  return <div className="settings-page" dir="rtl">
    <header className="settings-header">
      <div>
        <Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link>
        <span className="section-kicker">ROOMORA ADMIN</span>
        <h1>إعدادات التشغيل</h1>
        <p>اضبط يوم الفندق وحدود الطلبات ومستويات التأخير من مكان واحد.</p>
      </div>
      <button className="primary-btn" onClick={save}><FloppyDisk size={18}/>{saved ? "تم الحفظ" : "حفظ التغييرات"}</button>
    </header>

    <div className="settings-grid">
      <motion.section className="panel settings-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <div className="settings-title"><div className="settings-icon"><Clock size={20}/></div><div><h2>يوم الفندق</h2><p>تحديد متى يبدأ اليوم التشغيلي الجديد.</p></div></div>
        <div className="form-grid">
          <label><span>بداية يوم الفندق</span><input type="time" value={start} onChange={e=>{setStart(e.target.value);setSaved(false)}}/></label>
          <label><span>موعد الخروج الافتراضي</span><input type="time" value={checkout} onChange={e=>{setCheckout(e.target.value);setSaved(false)}}/></label>
        </div>
        <div className="business-preview">
          <div><span>اليوم التشغيلي الحالي</span><b>{businessDay.label}</b></div>
          <small>المنطقة الزمنية: Asia/Riyadh</small>
        </div>
      </motion.section>

      <motion.section className="panel settings-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.05}}>
        <div className="settings-title"><div className="settings-icon"><Gauge size={20}/></div><div><h2>SLA الطلبات</h2><p>متى يتحول الطلب إلى تحذير أو حالة حرجة.</p></div></div>
        <div className="form-grid">
          <label><span>تحذير بعد</span><div className="number-field"><input type="number" min="1" value={warn} onChange={e=>{setWarn(Number(e.target.value));setSaved(false)}}/><em>دقيقة</em></div></label>
          <label><span>حرج بعد</span><div className="number-field"><input type="number" min={warn+1} value={critical} onChange={e=>{setCritical(Number(e.target.value));setSaved(false)}}/><em>دقيقة</em></div></label>
        </div>
        <div className="sla-bar"><span style={{width:`${Math.min(100,(warn/critical)*100)}%`}}/><i>Normal</i><b>Warning</b><strong>Critical</strong></div>
      </motion.section>
    </div>

    <section className="panel limits-card">
      <div className="settings-title"><div className="settings-icon"><Package size={20}/></div><div><h2>حدود طلبات الغرف</h2><p>أي تجاوز للحد يمكن تحويله لموافقة الإدارة بدل منع الخدمة.</p></div></div>
      <div className="limit-table-wrap">
        <table className="limit-table">
          <thead><tr><th>الصنف</th><th>لكل طلب</th><th>لكل يوم فندقي</th><th>لكل إقامة</th><th>التجاوز</th></tr></thead>
          <tbody>{limits.map((item,idx)=><tr key={item.name}>
            <td><b>{item.name}</b></td>
            <td><input type="number" min="0" value={item.perRequest} onChange={e=>updateLimit(idx,"perRequest",Number(e.target.value))}/></td>
            <td><input type="number" min="0" value={item.perDay} onChange={e=>updateLimit(idx,"perDay",Number(e.target.value))}/></td>
            <td><input type="number" min="0" value={item.perStay} onChange={e=>updateLimit(idx,"perStay",Number(e.target.value))}/></td>
            <td><span className="approval-chip"><ShieldCheck size={14}/> موافقة الإدارة</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="settings-note">
      <Bell size={19}/>
      <div><b>تنبيه مهم</b><p>هذه الشاشة أصبحت جاهزة بصريًا ومنطقيًا. الحفظ الدائم سيُربط بـCloudflare D1 بعد إنشاء قاعدة البيانات والـWorker في حساب Cloudflare.</p></div>
    </section>
  </div>
}
