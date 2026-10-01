"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bed, Buildings, CalendarBlank, CheckCircle, Phone, User, X } from "@phosphor-icons/react";
import type { Room } from "@/lib/data";
import ModalFrame from "@/components/ui/ModalFrame";

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


const roomStateLabel:Record<string,string>={
  available:"متاحة",
  occupied:"مشغولة",
  checkout:"خروج اليوم",
  request:"طلب مفتوح",
  cleaning:"تنظيف",
  maintenance:"صيانة"
};

export function RoomCheckinPicker({
  open,
  rooms,
  onClose,
  onSelect
}:{
  open:boolean;
  rooms:Room[];
  onClose:()=>void;
  onSelect:(room:Room)=>void;
}) {
  const [query,setQuery]=useState("");
  const [floor,setFloor]=useState<number|"all">("all");

  useEffect(()=>{
    if(open){setQuery("");setFloor("all");}
  },[open]);

  const filtered=useMemo(()=>rooms.filter(room=>
    (floor==="all"||room.floor===floor) &&
    (!query||room.number.includes(query)||(room.guest||"").includes(query))
  ),[rooms,floor,query]);

  const availableCount=rooms.filter(room=>!room.stayId&&room.status==="available").length;

  return <ModalFrame open={open} onClose={onClose} className="checkin-picker-modal" ariaLabelledBy="checkin-picker-title">
    <button className="close" onClick={onClose}><X size={19}/></button>
    <div className="checkin-picker-head">
      <div><span className="section-kicker">ROOM ASSIGNMENT</span><h2 id="checkin-picker-title">تسجيل دخول نزيل</h2><p>اختر الغرفة أولًا، ثم أدخل بيانات النزيل والحجز.</p></div>
      <div className="availability-summary"><CheckCircle size={18}/><div><b>{availableCount}</b><span>غرفة متاحة الآن</span></div></div>
    </div>

    <div className="checkin-picker-tools">
      <div className="search wide"><Buildings size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث برقم الغرفة أو اسم النزيل"/></div>
      <select value={String(floor)} onChange={e=>setFloor(e.target.value==="all"?"all":Number(e.target.value))}>
        <option value="all">كل الأدوار</option>
        <option value="0">الأرضي</option><option value="1">الأول</option><option value="2">الثاني</option><option value="3">الثالث</option><option value="4">الرابع</option>
      </select>
    </div>

    <div className="checkin-room-list">
      {filtered.map(room=>{
        const selectable=!room.stayId&&room.status==="available";
        return <button
          type="button"
          key={room.id}
          className={"checkin-room-option "+(selectable?"available":"unavailable")}
          disabled={!selectable}
          onClick={()=>selectable&&onSelect(room)}
        >
          <div className="checkin-room-icon"><Bed size={18}/></div>
          <div className="checkin-room-copy"><b>الغرفة {room.number}</b><span>{room.type} · الدور {room.floor===0?"الأرضي":room.floor}</span>{room.guest?<small>النزيل الحالي: {room.guest}</small>:null}</div>
          <div className={"checkin-room-status "+(selectable?"ok":"busy")}><i className={"status-dot "+room.status}/><span>{roomStateLabel[room.status]||room.status}</span></div>
          <div className="checkin-room-cta">{selectable?"اختيار وتسكين":"غير متاحة"}</div>
        </button>
      })}
      {filtered.length===0?<div className="rooms-state">لا توجد غرف مطابقة للبحث.</div>:null}
    </div>
  </ModalFrame>;
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

  return <ModalFrame open={Boolean(room)} onClose={onClose}>
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
    </ModalFrame>;
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

  return <ModalFrame open={Boolean(room)} onClose={onClose}>
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
    </ModalFrame>;
}
