"use client";

import { useEffect,useState } from "react";
import { CalendarBlank,Clock,ListChecks,Phone,X } from "@phosphor-icons/react";
import ModalFrame from "@/components/ui/ModalFrame";

type StayDetail={
  stay:{id:string;guest_name:string;guest_phone?:string|null;status:string;checkin_at:string;expected_checkout_at:string;actual_checkout_at?:string|null;room_number:string;room_type:string;created_by_name?:string|null};
  extensions:Array<{previous_checkout_at:string;new_checkout_at:string;reason?:string|null;created_at:string;changed_by_name?:string|null}>;
  requests:Array<{id:string;status:string;requested_at:string;delivered_at?:string|null;note?:string|null;items:string}>;
};

export default function StayDetailDialog({stayId,onClose}:{stayId:string|null;onClose:()=>void}){
  const [data,setData]=useState<StayDetail|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!stayId)return;
    setData(null);setError("");
    fetch("/api/stays/"+encodeURIComponent(stayId),{cache:"no-store"})
      .then(async r=>({ok:r.ok,status:r.status,p:await r.json().catch(()=>null)}))
      .then(({ok,status,p})=>{
        if(status===403)setError("هذه التفاصيل متاحة للإدارة فقط");
        else if(!ok||!p)setError("تعذر تحميل ملف الإقامة");
        else setData(p);
      }).catch(()=>setError("تعذر تحميل ملف الإقامة"));
  },[stayId]);
  if(!stayId)return null;
  const fmt=(v?:string|null)=>!v?"—":new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v));

  return <ModalFrame open={Boolean(stayId)} onClose={onClose} className="detail-modal stay-detail-modal">
      <button className="close" onClick={onClose}><X size={19}/></button>
      <span className="section-kicker">GUEST STAY FILE</span>
      <h2>ملف النزيل والإقامة</h2>
      {error?<div className="rooms-state error">{error}</div>:!data?<div className="rooms-state">جاري تحميل الملف…</div>:<>
        <div className="guest-profile-head">
          <div className="avatar large">{data.stay.guest_name.slice(0,1)}</div>
          <div><h3>{data.stay.guest_name}</h3><p><Phone size={13}/> {data.stay.guest_phone||"غير مسجل"}</p></div>
        </div>
        <div className="detail-summary">
          <div><span>الغرفة</span><b>{data.stay.room_number}</b></div>
          <div><span>نوع الغرفة</span><b>{data.stay.room_type}</b></div>
          <div><span>الحالة</span><b>{data.stay.status==="in_house"?"داخل الفندق":data.stay.status==="checked_out"?"غادر":"ملغاة"}</b></div>
          <div><span>سجّل الإقامة</span><b>{data.stay.created_by_name||"غير معروف"}</b></div>
        </div>
        <div className="detail-section"><h3><CalendarBlank size={16}/> مواعيد الإقامة</h3>
          <dl className="detail-list"><div><dt>الدخول</dt><dd>{fmt(data.stay.checkin_at)}</dd></div><div><dt>الخروج المتوقع</dt><dd>{fmt(data.stay.expected_checkout_at)}</dd></div><div><dt>الخروج الفعلي</dt><dd>{fmt(data.stay.actual_checkout_at)}</dd></div></dl>
        </div>
        <div className="detail-section"><h3><Clock size={16}/> سجل التمديدات</h3>
          {data.extensions.length===0?<p className="detail-empty">لا توجد تمديدات.</p>:<div className="timeline-list">{data.extensions.map((x,i)=><div key={i}><b>{fmt(x.previous_checkout_at)} ← {fmt(x.new_checkout_at)}</b><span>{x.changed_by_name||"غير معروف"}{x.reason?" · "+x.reason:""}</span></div>)}</div>}
        </div>
        <div className="detail-section"><h3><ListChecks size={16}/> طلبات الإقامة</h3>
          {data.requests.length===0?<p className="detail-empty">لا توجد طلبات لهذه الإقامة.</p>:<div className="timeline-list">{data.requests.map(x=><div key={x.id}><b>{x.items||"طلب غرفة"}</b><span>{fmt(x.requested_at)} · {x.status}</span></div>)}</div>}
        </div>
      </>}
    </ModalFrame>;
}
