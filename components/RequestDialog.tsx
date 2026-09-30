"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, X } from "@phosphor-icons/react";
import type { Room } from "@/lib/data";

type RequestItem={
  id:string;
  name:string;
  unit:string;
  max_per_request:number|null;
  max_per_business_day:number|null;
  max_per_stay:number|null;
};

type Line={itemId:string;quantity:number};

export default function RequestDialog({
  room,
  onClose,
  onSuccess
}:{
  room:Room|null;
  onClose:()=>void;
  onSuccess:(result:{requiresApproval:boolean;violations:string[]})=>Promise<void>|void;
}) {
  const [items,setItems]=useState<RequestItem[]>([]);
  const [lines,setLines]=useState<Line[]>([{itemId:"",quantity:1}]);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if (!room) return;
    fetch("/api/request-items",{cache:"no-store"})
      .then(r=>r.json())
      .then(data=>{
        if (Array.isArray(data)) {
          setItems(data);
          if (data[0]) setLines([{itemId:data[0].id,quantity:1}]);
        }
      })
      .catch(()=>setError("تعذر تحميل قائمة المستهلكات"));
  },[room?.stayId]);

  if (!room?.stayId) return null;

  function updateLine(index:number,patch:Partial<Line>) {
    setLines(prev=>prev.map((line,i)=>i===index?{...line,...patch}:line));
  }

  function addLine() {
    const fallback=items.find(item=>!lines.some(line=>line.itemId===item.id)) || items[0];
    if (!fallback) return;
    setLines(prev=>[...prev,{itemId:fallback.id,quantity:1}]);
  }

  function removeLine(index:number) {
    setLines(prev=>prev.length===1?prev:prev.filter((_,i)=>i!==index));
  }

  async function submit(e:FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");

    const payloadLines=lines.filter(line=>line.itemId && line.quantity>0);
    const response=await fetch("/api/requests",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        stayId:room!.stayId,
        lines:payloadLines,
        note:note.trim() || undefined
      })
    });
    const payload=await response.json().catch(()=>({}));

    if (!response.ok) {
      const map:Record<string,string>={
        active_stay_not_found:"الإقامة لم تعد نشطة",
        request_item_not_found:"أحد الأصناف غير متاح",
        invalid_request_payload:"أضف صنفًا واحدًا على الأقل"
      };
      setError(map[payload.error] || "تعذر إنشاء الطلب");
      setLoading(false);
      return;
    }

    await onSuccess({
      requiresApproval:Boolean(payload.requiresApproval),
      violations:Array.isArray(payload.violations)?payload.violations:[]
    });
    onClose();
  }

  return <AnimatePresence><>
    <motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}/>
    <motion.section className="operation-modal request-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:18,scale:.98}}>
      <button className="close" onClick={onClose}><X size={19}/></button>
      <span className="section-kicker">ROOM SERVICE</span>
      <h2>إضافة طلب للغرفة</h2>
      <p className="operation-sub">الغرفة {room.number} · {room.guest}</p>

      <form onSubmit={submit}>
        <div className="request-lines">
          {lines.map((line,index)=>{
            const item=items.find(i=>i.id===line.itemId);
            return <div className="request-line-editor" key={index}>
              <select value={line.itemId} onChange={e=>updateLine(index,{itemId:e.target.value})}>
                {items.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
              <div className="qty-stepper">
                <button type="button" onClick={()=>updateLine(index,{quantity:Math.max(1,line.quantity-1)})}><Minus size={14}/></button>
                <b>{line.quantity}</b>
                <button type="button" onClick={()=>updateLine(index,{quantity:line.quantity+1})}><Plus size={14}/></button>
              </div>
              <button className="remove-line" type="button" onClick={()=>removeLine(index)}>حذف</button>
              {item && <small>حد الطلب: {item.max_per_request ?? "—"} · اليوم: {item.max_per_business_day ?? "—"} · الإقامة: {item.max_per_stay ?? "—"}</small>}
            </div>;
          })}
        </div>

        <button className="secondary-btn full" type="button" onClick={addLine}><Plus size={16}/> إضافة صنف آخر</button>
        <label className="login-field"><span>ملاحظة — اختياري</span><div><input value={note} onChange={e=>setNote(e.target.value)} placeholder="مثال: بدون طرق الباب"/></div></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn full" disabled={loading}>{loading?"جاري إنشاء الطلب…":"تسجيل الطلب"}</button>
      </form>
    </motion.section>
  </></AnimatePresence>;
}
