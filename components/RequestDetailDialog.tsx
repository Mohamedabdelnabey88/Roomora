"use client";

import { useEffect,useState } from "react";
import { AnimatePresence,motion } from "framer-motion";
import { Clock,Package,ShieldCheck,User,X } from "@phosphor-icons/react";

type Detail={
  request:{
    id:string;status:string;priority:string;business_day:string;note?:string|null;
    requested_at:string;delivered_at?:string|null;room_number:string;stay_id:string;
    guest_name:string;guest_phone?:string|null;requested_by_name?:string|null;
    acknowledged_by_name?:string|null;delivered_by_name?:string|null;
  };
  lines:Array<{name:string;unit:string;quantity:number}>;
  approval?:{reason:string;status:string;decision_note?:string|null;created_at:string;decided_at?:string|null;decided_by_name?:string|null}|null;
};

const statusLabel:Record<string,string>={
  new:"جديد",acknowledged:"تم الاستلام",preparing:"جاري التجهيز",delivered:"تم التسليم",
  cancelled:"ملغي",approval_required:"بانتظار موافقة"
};

export default function RequestDetailDialog({requestId,onClose}:{requestId:string|null;onClose:()=>void}){
  const [data,setData]=useState<Detail|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!requestId)return;
    setData(null);setError("");
    fetch("/api/requests/"+encodeURIComponent(requestId),{cache:"no-store"})
      .then(async r=>({ok:r.ok,p:await r.json().catch(()=>null)}))
      .then(({ok,p})=>{if(!ok||!p)setError("تعذر تحميل تفاصيل الطلب");else setData(p);})
      .catch(()=>setError("تعذر تحميل تفاصيل الطلب"));
  },[requestId]);

  if(!requestId)return null;
  const fmt=(v?:string|null)=>!v?"—":new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(v));

  return <AnimatePresence><>
    <motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}/>
    <motion.section className="operation-modal detail-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:18,scale:.98}}>
      <button className="close" onClick={onClose}><X size={19}/></button>
      <span className="section-kicker">REQUEST DETAILS</span>
      <h2>تفاصيل طلب الغرفة</h2>
      {error?<div className="rooms-state error">{error}</div>:!data?<div className="rooms-state">جاري تحميل التفاصيل…</div>:<>
        <div className="detail-summary">
          <div><span>الغرفة</span><b>{data.request.room_number}</b></div>
          <div><span>النزيل</span><b>{data.request.guest_name}</b></div>
          <div><span>الحالة</span><b>{statusLabel[data.request.status]||data.request.status}</b></div>
          <div><span>يوم الفندق</span><b>{data.request.business_day}</b></div>
        </div>
        <div className="detail-section"><h3><Clock size={16}/> التسلسل الزمني</h3>
          <dl className="detail-list">
            <div><dt>وقت إنشاء الطلب</dt><dd>{fmt(data.request.requested_at)}</dd></div>
            <div><dt>أنشأه</dt><dd>{data.request.requested_by_name||"غير معروف"}</dd></div>
            <div><dt>استلمه</dt><dd>{data.request.acknowledged_by_name||"لم يُستلم بعد"}</dd></div>
            <div><dt>سلّمه</dt><dd>{data.request.delivered_by_name||"لم يُسلّم بعد"}</dd></div>
            <div><dt>وقت التسليم</dt><dd>{fmt(data.request.delivered_at)}</dd></div>
          </dl>
        </div>
        <div className="detail-section"><h3><Package size={16}/> الأصناف</h3>
          <div className="detail-lines">{data.lines.map((l,i)=><div key={i}><b>{l.name}</b><span>{l.quantity} {l.unit}</span></div>)}</div>
        </div>
        {data.request.note&&<div className="detail-section"><h3>ملاحظة الطلب</h3><p className="detail-note">{data.request.note}</p></div>}
        {data.approval&&<div className="detail-section approval-detail"><h3><ShieldCheck size={16}/> الموافقة</h3>
          <dl className="detail-list">
            <div><dt>السبب</dt><dd>{data.approval.reason}</dd></div>
            <div><dt>الحالة</dt><dd>{data.approval.status}</dd></div>
            <div><dt>قرار بواسطة</dt><dd>{data.approval.decided_by_name||"—"}</dd></div>
            <div><dt>وقت القرار</dt><dd>{fmt(data.approval.decided_at)}</dd></div>
            {data.approval.decision_note&&<div><dt>ملاحظة القرار</dt><dd>{data.approval.decision_note}</dd></div>}
          </dl>
        </div>}
      </>}
    </motion.section>
  </></AnimatePresence>;
}
