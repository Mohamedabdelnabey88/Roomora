"use client";

import { useEffect,useState } from "react";
import { CalendarBlank,Clock,ListChecks,Phone,Trash,WarningCircle,X } from "@phosphor-icons/react";
import ModalFrame from "@/components/ui/ModalFrame";

type StayDetail={
  stay:{id:string;guest_name:string;guest_phone?:string|null;status:string;checkin_at:string;expected_checkout_at:string;actual_checkout_at?:string|null;room_number:string;room_type:string;created_by_name?:string|null};
  extensions:Array<{previous_checkout_at:string;new_checkout_at:string;reason?:string|null;created_at:string;changed_by_name?:string|null}>;
  requests:Array<{id:string;status:string;requested_at:string;delivered_at?:string|null;note?:string|null;items:string}>;
};

export default function StayDetailDialog({stayId,role,onClose,onDeleted}:{stayId:string|null;role:"admin"|"reception"|null;onClose:()=>void;onDeleted:()=>Promise<void>|void}){
  const [data,setData]=useState<StayDetail|null>(null);
  const [error,setError]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  useEffect(()=>{
    if(!stayId)return;
    setData(null);setError("");setConfirmDelete(false);setDeleting(false);
    fetch("/api/stays/"+encodeURIComponent(stayId),{cache:"no-store"})
      .then(async r=>({ok:r.ok,status:r.status,p:await r.json().catch(()=>null)}))
      .then(({ok,status,p})=>{
        if(status===403)setError("هذه التفاصيل متاحة للإدارة فقط");
        else if(!ok||!p)setError("تعذر تحميل ملف الإقامة");
        else setData(p);
      }).catch(()=>setError("تعذر تحميل ملف الإقامة"));
  },[stayId]);
  async function deleteStay(){
    if(!stayId||role!=="admin"||deleting)return;
    setDeleting(true);setError("");
    try{
      const response=await fetch("/api/stays/"+encodeURIComponent(stayId),{method:"DELETE"});
      const payload=await response.json().catch(()=>({}));
      const map:Record<string,string>={
        forbidden:"الحذف النهائي متاح لمدير النظام فقط.",
        stay_not_found:"ملف النزيل لم يعد موجودًا.",
        backend_unreachable:"تعذر الاتصال بخدمة Roomora الخلفية."
      };
      if(!response.ok)throw new Error(map[payload.error]||"تعذر حذف النزيل والإقامة.");
      setDeleting(false);setConfirmDelete(false);
      await onDeleted();
    }catch(e){
      setError(e instanceof Error?e.message:"تعذر حذف النزيل والإقامة.");
      setDeleting(false);
    }
  }

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
        {role==="admin"?<section className="guest-danger-zone">
          <div className="danger-zone-copy"><Trash size={18}/><div><b>حذف النزيل والحجز نهائيًا</b><span>سيتم حذف الإقامة، التمديدات، وكل طلبات الغرفة المرتبطة بها. إذا كانت الإقامة نشطة ستعود الغرفة إلى متاحة.</span></div></div>
          {!confirmDelete
            ?<button className="danger-delete-btn" onClick={()=>setConfirmDelete(true)}><Trash size={15}/> حذف النزيل والحجز</button>
            :<div className="delete-confirm-box"><div><WarningCircle size={17}/><span>تأكيد أخير: سيتم حذف ملف {data.stay.guest_name} وإقامته نهائيًا.</span></div><div><button className="secondary-btn" onClick={()=>setConfirmDelete(false)} disabled={deleting}>تراجع</button><button className="danger-delete-btn solid" onClick={()=>void deleteStay()} disabled={deleting}>{deleting?"جاري الحذف…":"نعم، احذف نهائيًا"}</button></div></div>}
        </section>:null}
      </>}
    </ModalFrame>;
}
