"use client";

import { useEffect,useMemo,useState } from "react";
import { Clock,Package,ShieldCheck,Trash,User,WarningCircle,X } from "@phosphor-icons/react";
import ModalFrame from "@/components/ui/ModalFrame";

type Detail={
  request:{id:string;status:string;priority:string;business_day:string;note?:string|null;requested_at:string;delivered_at?:string|null;room_number:string;stay_id:string;guest_name:string;guest_phone?:string|null;requested_by_name?:string|null;acknowledged_by_name?:string|null;delivered_by_name?:string|null};
  lines:Array<{name:string;unit:string;quantity:number}>;
  approval?:{reason:string;status:string;decision_note?:string|null;created_at:string;decided_at?:string|null;decided_by_name?:string|null}|null;
  timeline:Array<{action:string;metadata_json?:string|null;created_at:string;actor_name?:string|null}>;
};

const statusLabel:Record<string,string>={new:"جديد",acknowledged:"تم الاستلام",preparing:"جاري التجهيز",delivered:"تم التسليم",cancelled:"ملغي",approval_required:"بانتظار موافقة"};

function fmt(v?:string|null){return !v?"—":new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}

export default function RequestDetailDialog({requestId,role,onClose,onDeleted}:{requestId:string|null;role:"admin"|"reception"|null;onClose:()=>void;onDeleted:()=>Promise<void>|void}){
  const [data,setData]=useState<Detail|null>(null);
  const [error,setError]=useState("");
  const [deleting,setDeleting]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);

  useEffect(()=>{
    if(!requestId)return;
    setData(null);
    setError("");
    setDeleting(false);
    setConfirmDelete(false);
    fetch("/api/requests/"+encodeURIComponent(requestId),{cache:"no-store"})
      .then(async r=>({ok:r.ok,p:await r.json().catch(()=>null)}))
      .then(({ok,p})=>{if(!ok||!p)setError("تعذر تحميل تفاصيل الطلب");else setData(p)})
      .catch(()=>setError("تعذر تحميل تفاصيل الطلب"));
  },[requestId]);

  async function deleteRequest(){
    if(!requestId||role!=="admin"||deleting)return;
    setDeleting(true);setError("");
    try{
      const response=await fetch("/api/requests/"+encodeURIComponent(requestId),{method:"DELETE"});
      const payload=await response.json().catch(()=>({}));
      const map:Record<string,string>={
        forbidden:"الحذف النهائي متاح لمدير النظام فقط.",
        request_not_found:"الطلب لم يعد موجودًا.",
        backend_unreachable:"تعذر الاتصال بخدمة Roomora الخلفية."
      };
      if(!response.ok)throw new Error(map[payload.error]||"تعذر حذف الطلب نهائيًا.");
      setDeleting(false);
      setConfirmDelete(false);
      await onDeleted();
    }catch(e){
      setError(e instanceof Error?e.message:"تعذر حذف الطلب نهائيًا.");
      setDeleting(false);setConfirmDelete(false);
    }
  }

  const timeline=useMemo(()=>{
    if(!data)return[];
    return data.timeline.map(event=>{
      let label=event.action;
      try{
        const meta=event.metadata_json?JSON.parse(event.metadata_json):null;
        if(event.action==="service_request_created")label="إنشاء الطلب";
        else if(event.action==="service_request_status_changed")label="تغيير الحالة إلى "+(statusLabel[String(meta?.to)]||String(meta?.to||""));
        else if(event.action==="service_request_decision")label="قرار الإدارة: "+(String(meta?.decision||"")==="approved"?"موافقة":"رفض");
      }catch{}
      return {...event,label};
    });
  },[data]);

  if(!requestId)return null;
  return <ModalFrame open={Boolean(requestId)} onClose={onClose} className="request-detail-modal">
      <header className="detail-modal-header">
        <div><span className="section-kicker">REQUEST DETAILS</span><h2>تفاصيل طلب الغرفة</h2>{data?<p>طلب #{data.request.id.slice(0,8).toUpperCase()} · يوم الفندق {data.request.business_day}</p>:null}</div>
        <button className="close inline-close" onClick={onClose} aria-label="إغلاق"><X size={19}/></button>
      </header>

      <div className="detail-modal-body">
      {error?<div className="rooms-state error">{error}</div>:!data?<div className="rooms-state">جاري تحميل التفاصيل…</div>:<>
        <div className="request-detail-hero">
          <div className="request-room-number"><span>الغرفة</span><b>{data.request.room_number}</b></div>
          <div className="request-guest"><div className="room-avatar"><User size={18}/></div><div><span>النزيل</span><b>{data.request.guest_name}</b><small>{data.request.guest_phone||"الجوال غير مسجل"}</small></div></div>
          <span className={"detail-status "+data.request.status}>{statusLabel[data.request.status]||data.request.status}</span>
        </div>

        <div className="detail-two-col">
          <section className="detail-card">
            <div className="detail-card-title"><Package size={17}/><div><b>محتوى الطلب</b><span>{data.lines.length} صنف</span></div></div>
            <div className="order-lines">{data.lines.map((line,i)=><div key={i}><div><b>{line.name}</b><span>{line.unit}</span></div><strong>{line.quantity}</strong></div>)}</div>
            {data.request.note?<div className="request-note"><span>ملاحظة</span><p>{data.request.note}</p></div>:null}
          </section>

          <section className="detail-card">
            <div className="detail-card-title"><Clock size={17}/><div><b>التنفيذ</b><span>المسؤولون والتوقيت</span></div></div>
            <dl className="execution-grid">
              <div><dt>إنشاء الطلب</dt><dd>{fmt(data.request.requested_at)}</dd><small>{data.request.requested_by_name||"غير معروف"}</small></div>
              <div><dt>استلام الطلب</dt><dd>{data.request.acknowledged_by_name||"لم يُستلم بعد"}</dd></div>
              <div><dt>التسليم</dt><dd>{fmt(data.request.delivered_at)}</dd><small>{data.request.delivered_by_name||"لم يُسلّم بعد"}</small></div>
            </dl>
          </section>
        </div>

        {data.approval?<section className="approval-panel">
          <ShieldCheck size={20}/><div><span>موافقة إدارية</span><b>{data.approval.reason}</b><small>{data.approval.status==="pending"?"بانتظار القرار":data.approval.status==="approved"?"تمت الموافقة":"تم الرفض"}{data.approval.decided_by_name?" · "+data.approval.decided_by_name:""}</small></div>
        </section>:null}

        <section className="detail-card timeline-card">
          <div className="detail-card-title"><Clock size={17}/><div><b>سجل الحركة</b><span>Audit trail للطلب</span></div></div>
          {timeline.length?<div className="pro-timeline">{timeline.map((event,i)=><div key={i}><i/><div><b>{event.label}</b><span>{fmt(event.created_at)} · {event.actor_name||"النظام"}</span></div></div>)}</div>:<p className="detail-empty">لا توجد أحداث إضافية.</p>}
        </section>

        {role==="admin"?<section className="request-danger-zone">
          <div className="danger-zone-copy"><Trash size={18}/><div><b>حذف الطلب نهائيًا</b><span>يحذف الطلب وكل أصنافه والموافقة المرتبطة به من قاعدة البيانات. لا يمكن التراجع عن هذه العملية.</span></div></div>
          {!confirmDelete?
            <button type="button" className="danger-delete-btn" onClick={()=>setConfirmDelete(true)}><Trash size={15}/> حذف نهائي</button>
            :<div className="delete-confirm-box">
              <div><WarningCircle size={17}/><span>تأكيد أخير: سيتم حذف الطلب #{data.request.id.slice(0,8).toUpperCase()} نهائيًا.</span></div>
              <div><button type="button" className="secondary-btn" onClick={()=>setConfirmDelete(false)} disabled={deleting}>تراجع</button><button type="button" className="danger-delete-btn solid" onClick={()=>void deleteRequest()} disabled={deleting}>{deleting?"جاري الحذف…":"نعم، احذف نهائيًا"}</button></div>
            </div>}
        </section>:null}
      </>}
      </div>
    </ModalFrame>;
}
