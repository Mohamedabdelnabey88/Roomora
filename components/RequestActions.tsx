"use client";

import { useState } from "react";
import { Check,CookingPot,HandPalm,Prohibit,ShieldCheck,WarningCircle } from "@phosphor-icons/react";
import { notifyOperationsChanged } from "@/lib/operations-events";

export type ActiveRequest={
  id:string;room_number:string;guest_name:string;items:string;status:string;priority:string;requested_at:string;approval_reason?:string|null;
};

const errorMap:Record<string,string>={
  invalid_status_transition:"لا يمكن الانتقال إلى هذه الحالة من المرحلة الحالية.",
  approval_required:"الطلب يحتاج موافقة الإدارة أولًا.",
  forbidden:"ليست لديك صلاحية تنفيذ هذا الإجراء.",
  request_not_found:"الطلب لم يعد موجودًا.",
  approval_already_decided:"تم اتخاذ قرار على هذا الطلب بالفعل."
};

export default function RequestActions({request,role,onChanged}:{request:ActiveRequest;role:"admin"|"reception"|null;onChanged:()=>Promise<void>|void}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function call(url:string,init:RequestInit){
    if(busy)return;
    setBusy(true);setError("");
    try{
      const response=await fetch(url,init);
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(errorMap[payload.error]||"تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.");
      notifyOperationsChanged();
      await onChanged();
    }catch(e){
      setError(e instanceof Error?e.message:"تعذر تنفيذ الإجراء");
    }finally{setBusy(false)}
  }

  const setStatus=(status:string)=>call("/api/requests/"+encodeURIComponent(request.id)+"/status",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
  const decide=(decision:"approved"|"rejected")=>call("/api/requests/"+encodeURIComponent(request.id)+"/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision})});

  let controls:React.ReactNode=null;
  if(request.status==="approval_required"){
    controls=role!=="admin"
      ?<div className="request-awaiting"><ShieldCheck size={15}/> بانتظار قرار الإدارة</div>
      :<div className="request-actions approval"><button disabled={busy} onClick={()=>void decide("approved")}><Check size={14}/> موافقة</button><button disabled={busy} className="danger" onClick={()=>void decide("rejected")}><Prohibit size={14}/> رفض</button></div>;
  }else if(request.status==="new"){
    controls=<div className="request-actions"><button disabled={busy} onClick={()=>void setStatus("acknowledged")}><HandPalm size={14}/> استلام الطلب</button><button disabled={busy} className="ghost-danger" onClick={()=>void setStatus("cancelled")}>إلغاء</button></div>;
  }else if(request.status==="acknowledged"){
    controls=<div className="request-actions"><button disabled={busy} onClick={()=>void setStatus("preparing")}><CookingPot size={14}/> بدء التجهيز</button><button disabled={busy} className="ghost-danger" onClick={()=>void setStatus("cancelled")}>إلغاء</button></div>;
  }else if(request.status==="preparing"){
    controls=<div className="request-actions"><button disabled={busy} onClick={()=>void setStatus("delivered")}><Check size={14}/> تأكيد التسليم</button><button disabled={busy} className="ghost-danger" onClick={()=>void setStatus("cancelled")}>إلغاء</button></div>;
  }

  if(!controls&&!error)return null;
  return <div className="request-action-stack">{controls}{error?<div className="inline-action-error"><WarningCircle size={14}/>{error}</div>:null}</div>;
}
