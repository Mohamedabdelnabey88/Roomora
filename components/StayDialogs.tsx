"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarBlank, Phone, User, X } from "@phosphor-icons/react";
import type { Room } from "@/lib/data";

function toLocalInput(date: Date) {
  const pad = (n:number) => String(n).padStart(2,"0");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+"T"+pad(date.getHours())+":"+pad(date.getMinutes());
}

function defaultCheckout() {
  const d = new Date();
  d.setDate(d.getDate()+1);
  d.setHours(12,0,0,0);
  return toLocalInput(d);
}

export function CheckinDialog({
  room,
  onClose,
  onSuccess
}:{
  room:Room|null;
  onClose:()=>void;
  onSuccess:()=>Promise<void>|void;
}) {
  const [guestName,setGuestName]=useState("");
  const [guestPhone,setGuestPhone]=useState("");
  const [checkout,setCheckout]=useState(defaultCheckout);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if (!room) return;
    setGuestName("");
    setGuestPhone("");
    setCheckout(defaultCheckout());
    setLoading(false);
    setError("");
  },[room?.id]);

  if (!room) return null;

  async function submit(e:FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const response=await fetch("/api/stays",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        roomId:room!.id,
        guestName:guestName.trim(),
        guestPhone:guestPhone.trim() || undefined,
        expectedCheckoutAt:new Date(checkout).toISOString()
      })
    });
    const payload=await response.json().catch(()=>({}));

    if (!response.ok) {
      const map:Record<string,string>={
        room_not_available:"الغرفة لم تعد متاحة للتسكين",
        active_stay_exists:"يوجد بالفعل نزيل حالي مرتبط بهذه الغرفة",
        invalid_checkout_time:"وقت الخروج يجب أن يكون في المستقبل",
        invalid_checkin_payload:"أكمل بيانات الإقامة المطلوبة"
      };
      setError(map[payload.error] || "تعذر تسجيل دخول النزيل");
      setLoading(false);
      return;
    }

    await onSuccess();
    onClose();
  }

  return <AnimatePresence><>
    <motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}/>
    <motion.section className="operation-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:18,scale:.98}}>
      <button className="close" onClick={onClose}><X size={19}/></button>
      <span className="section-kicker">NEW STAY</span>
      <h2>تسجيل دخول نزيل</h2>
      <p className="operation-sub">الغرفة {room.number} · {room.type}</p>

      <form onSubmit={submit}>
        <label className="login-field"><span>اسم النزيل</span><div><User size={18}/><input autoFocus value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder="الاسم الكامل" required/></div></label>
        <label className="login-field"><span>رقم الجوال — اختياري</span><div><Phone size={18}/><input dir="ltr" value={guestPhone} onChange={e=>setGuestPhone(e.target.value)} placeholder="05xxxxxxxx"/></div></label>
        <label className="login-field"><span>الخروج المتوقع</span><div><CalendarBlank size={18}/><input type="datetime-local" value={checkout} onChange={e=>setCheckout(e.target.value)} required/></div></label>

        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn full" disabled={loading}>{loading?"جاري تسجيل الإقامة…":"تأكيد تسجيل الدخول"}</button>
      </form>
    </motion.section>
  </></AnimatePresence>;
}

export function ExtendStayDialog({
  room,
  onClose,
  onSuccess
}:{
  room:Room|null;
  onClose:()=>void;
  onSuccess:()=>Promise<void>|void;
}) {
  const initial = useMemo(()=>{
    const d=room?.expectedCheckoutAt ? new Date(room.expectedCheckoutAt) : new Date();
    d.setDate(d.getDate()+1);
    return toLocalInput(d);
  },[room?.expectedCheckoutAt]);

  const [checkout,setCheckout]=useState(initial);
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if (!room?.stayId) return;
    setCheckout(initial);
    setReason("");
    setLoading(false);
    setError("");
  },[room?.stayId, initial]);

  if (!room?.stayId) return null;

  async function submit(e:FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");

    const response=await fetch("/api/stays/"+encodeURIComponent(room!.stayId!)+"/extend",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        expectedCheckoutAt:new Date(checkout).toISOString(),
        reason:reason.trim() || undefined
      })
    });
    const payload=await response.json().catch(()=>({}));

    if (!response.ok) {
      setError(payload.error==="extension_must_be_later" ? "موعد الخروج الجديد يجب أن يكون بعد الموعد الحالي" : "تعذر تمديد الإقامة");
      setLoading(false);
      return;
    }

    await onSuccess();
    onClose();
  }

  return <AnimatePresence><>
    <motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}/>
    <motion.section className="operation-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:18,scale:.98}}>
      <button className="close" onClick={onClose}><X size={19}/></button>
      <span className="section-kicker">EXTEND STAY</span>
      <h2>تمديد الإقامة</h2>
      <p className="operation-sub">الغرفة {room.number} · {room.guest}</p>

      <form onSubmit={submit}>
        <label className="login-field"><span>الخروج المتوقع الجديد</span><div><CalendarBlank size={18}/><input type="datetime-local" value={checkout} onChange={e=>setCheckout(e.target.value)} required/></div></label>
        <label className="login-field"><span>سبب التمديد — اختياري</span><div><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="مثال: طلب النزيل ليلة إضافية"/></div></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn full" disabled={loading}>{loading?"جاري التمديد…":"تأكيد التمديد"}</button>
      </form>
    </motion.section>
  </></AnimatePresence>;
}
