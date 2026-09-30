"use client";

import { Check, CookingPot, HandPalm, Prohibit, ShieldCheck } from "@phosphor-icons/react";
import { notifyOperationsChanged } from "@/lib/operations-events";

export type ActiveRequest = {
  id:string;
  room_number:string;
  guest_name:string;
  items:string;
  status:string;
  priority:string;
  requested_at:string;
  approval_reason?:string|null;
};

export default function RequestActions({
  request,
  role,
  onChanged
}:{
  request:ActiveRequest;
  role:"admin"|"reception"|null;
  onChanged:()=>Promise<void>|void;
}) {
  async function setStatus(status:string) {
    const response=await fetch("/api/requests/"+encodeURIComponent(request.id)+"/status",{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({status})
    });
    if (response.ok) { notifyOperationsChanged(); await onChanged(); }
  }

  async function decide(decision:"approved"|"rejected") {
    const response=await fetch("/api/requests/"+encodeURIComponent(request.id)+"/decision",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({decision})
    });
    if (response.ok) { notifyOperationsChanged(); await onChanged(); }
  }

  if (request.status==="approval_required") {
    if (role!=="admin") return <div className="request-awaiting"><ShieldCheck size={14}/> بانتظار موافقة الإدارة</div>;
    return <div className="request-actions approval">
      <button onClick={()=>void decide("approved")}><Check size={14}/> موافقة</button>
      <button className="danger" onClick={()=>void decide("rejected")}><Prohibit size={14}/> رفض</button>
    </div>;
  }

  if (request.status==="new") {
    return <div className="request-actions">
      <button onClick={()=>void setStatus("acknowledged")}><HandPalm size={14}/> استلام</button>
      <button className="ghost-danger" onClick={()=>void setStatus("cancelled")}>إلغاء</button>
    </div>;
  }

  if (request.status==="acknowledged") {
    return <div className="request-actions">
      <button onClick={()=>void setStatus("preparing")}><CookingPot size={14}/> بدء التجهيز</button>
      <button className="ghost-danger" onClick={()=>void setStatus("cancelled")}>إلغاء</button>
    </div>;
  }

  if (request.status==="preparing") {
    return <div className="request-actions">
      <button onClick={()=>void setStatus("delivered")}><Check size={14}/> تم التسليم</button>
      <button className="ghost-danger" onClick={()=>void setStatus("cancelled")}>إلغاء</button>
    </div>;
  }

  return null;
}
