"use client";

import { FormEvent,useEffect,useMemo,useState } from "react";
import { Minus,Package,Plus,ShieldCheck,X } from "@phosphor-icons/react";
import type { Room } from "@/lib/data";
import ModalFrame from "@/components/ui/ModalFrame";

type RequestItem={id:string;name:string;unit:string;max_per_request:number|null;max_per_business_day:number|null;max_per_stay:number|null};
type Line={itemId:string;quantity:number};

export default function RequestDialog({room,onClose,onSuccess}:{room:Room|null;onClose:()=>void;onSuccess:(result:{requiresApproval:boolean;violations:string[]})=>Promise<void>|void}){
  const [items,setItems]=useState<RequestItem[]>([]);
  const [lines,setLines]=useState<Line[]>([]);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(false);
  const [loadingItems,setLoadingItems]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!room?.stayId)return;
    setItems([]);setLines([]);setNote("");setError("");setLoading(false);setLoadingItems(true);
    fetch("/api/request-items",{cache:"no-store"})
      .then(async r=>({ok:r.ok,p:await r.json().catch(()=>[])}))
      .then(({ok,p})=>{
        if(!ok||!Array.isArray(p)){setError("تعذر تحميل قائمة المستهلكات");return}
        setItems(p);
        if(p[0])setLines([{itemId:p[0].id,quantity:1}]);
      })
      .catch(()=>setError("تعذر تحميل قائمة المستهلكات"))
      .finally(()=>setLoadingItems(false));
  },[room?.stayId]);

  const selectedIds=useMemo(()=>new Set(lines.map(l=>l.itemId)),[lines]);
  if(!room?.stayId)return null;

  function update(index:number,patch:Partial<Line>){setLines(prev=>prev.map((line,i)=>i===index?{...line,...patch}:line))}
  function addLine(){
    const next=items.find(i=>!selectedIds.has(i.id))||items[0];
    if(next)setLines(prev=>[...prev,{itemId:next.id,quantity:1}]);
  }
  function removeLine(index:number){setLines(prev=>prev.length<=1?prev:prev.filter((_,i)=>i!==index))}

  async function submit(e:FormEvent){
    e.preventDefault();
    const payloadLines=lines.filter(l=>l.itemId&&l.quantity>0);
    if(!payloadLines.length){setError("أضف صنفًا واحدًا على الأقل");return}
    setLoading(true);setError("");
    const response=await fetch("/api/requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({stayId:room!.stayId,lines:payloadLines,note:note.trim()||undefined})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const map:Record<string,string>={active_stay_not_found:"الإقامة لم تعد نشطة",request_item_not_found:"أحد الأصناف غير متاح",invalid_request_payload:"أضف صنفًا واحدًا على الأقل"};
      setError(map[payload.error]||"تعذر إنشاء الطلب");setLoading(false);return;
    }
    await onSuccess({requiresApproval:Boolean(payload.requiresApproval),violations:Array.isArray(payload.violations)?payload.violations:[]});
    onClose();
  }

  return <ModalFrame open={Boolean(room?.stayId)} onClose={onClose} className="request-modal premium-request-modal" ariaLabelledBy="request-dialog-title">
      <header className="modal-hero">
        <div><span className="section-kicker">ROOM SERVICE</span><h2 id="request-dialog-title">طلب جديد للغرفة {room.number}</h2><p>{room.guest} · {room.type}</p></div>
        <button className="close inline-close" onClick={onClose} aria-label="إغلاق"><X size={19}/></button>
      </header>

      <form onSubmit={submit}>
        <div className="request-policy-note"><ShieldCheck size={17}/><div><b>السياسة تُطبق تلقائيًا</b><span>إذا تجاوزت الكمية حد الطلب أو اليوم أو الإقامة، ينتقل الطلب لموافقة الإدارة بدل رفضه.</span></div></div>

        <div className="form-section-head"><div><Package size={17}/><b>الأصناف المطلوبة</b></div><span>{lines.length} صنف</span></div>

        {loadingItems?<div className="rooms-state compact-state">جاري تحميل الأصناف…</div>:<div className="request-lines premium-lines">
          {lines.map((line,index)=>{
            const item=items.find(i=>i.id===line.itemId);
            return <div className="request-line-editor premium-line" key={index}>
              <div className="line-main">
                <select aria-label={"الصنف "+(index+1)} value={line.itemId} onChange={e=>update(index,{itemId:e.target.value})}>
                  {items.map(it=><option value={it.id} key={it.id}>{it.name}</option>)}
                </select>
                <div className="qty-stepper">
                  <button type="button" aria-label="تقليل الكمية" onClick={()=>update(index,{quantity:Math.max(1,line.quantity-1)})}><Minus size={14}/></button>
                  <b>{line.quantity}</b><span>{item?.unit||"قطعة"}</span>
                  <button type="button" aria-label="زيادة الكمية" onClick={()=>update(index,{quantity:line.quantity+1})}><Plus size={14}/></button>
                </div>
                <button className="remove-line" type="button" disabled={lines.length===1} onClick={()=>removeLine(index)}>حذف</button>
              </div>
              {item?<div className="line-limits"><span>للطلب <b>{item.max_per_request??"—"}</b></span><span>لليوم <b>{item.max_per_business_day??"—"}</b></span><span>للإقامة <b>{item.max_per_stay??"—"}</b></span></div>:null}
            </div>
          })}
        </div>}

        <button className="secondary-btn add-item-btn" type="button" onClick={addLine} disabled={!items.length}><Plus size={16}/> إضافة صنف آخر</button>

        <label className="premium-textarea"><span>ملاحظة للطلب <small>اختياري</small></span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="مثال: التسليم بهدوء بدون طرق الباب"/></label>
        {error?<div className="login-error">{error}</div>:null}

        <footer className="modal-actions">
          <button className="secondary-btn" type="button" onClick={onClose}>إلغاء</button>
          <button className="primary-btn" disabled={loading||loadingItems||!lines.length}>{loading?"جاري تسجيل الطلب…":"تسجيل الطلب"}</button>
        </footer>
      </form>
    </ModalFrame>;
}
