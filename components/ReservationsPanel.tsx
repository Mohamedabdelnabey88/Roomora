"use client";

import { FormEvent,useEffect,useMemo,useState } from "react";
import { Bed,CalendarBlank,CheckCircle,Clock,MagnifyingGlass,Phone,Plus,User,X } from "@phosphor-icons/react";
import ModalFrame from "@/components/ui/ModalFrame";

type Reservation={
  id:string;room_id:string;guest_name:string;guest_phone?:string|null;
  checkin_at:string;checkout_at:string;status:"booked"|"checked_in"|"cancelled";
  note?:string|null;stay_id?:string|null;room_number:string;room_type:string;floor:number;
};

type AvailabilityRoom={
  id:string;number:string;floor:number;room_type:string;operational_status:string;
  available:boolean;reason:string;
};

function toLocal(date:Date){
  const pad=(n:number)=>String(n).padStart(2,"0");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+"T"+pad(date.getHours())+":"+pad(date.getMinutes());
}
function defaultTimes(){
  const start=new Date();start.setDate(start.getDate()+1);start.setHours(14,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);end.setHours(12,0,0,0);
  return {checkin:toLocal(start),checkout:toLocal(end)};
}
function fmt(value:string){
  return new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}

export default function ReservationsPanel(){
  const initial=defaultTimes();
  const [rows,setRows]=useState<Reservation[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState("");
  const [scope,setScope]=useState<"upcoming"|"all"|"checked_in"|"cancelled">("upcoming");
  const [createOpen,setCreateOpen]=useState(false);
  const [guestName,setGuestName]=useState("");
  const [guestPhone,setGuestPhone]=useState("");
  const [checkin,setCheckin]=useState(initial.checkin);
  const [checkout,setCheckout]=useState(initial.checkout);
  const [note,setNote]=useState("");
  const [rooms,setRooms]=useState<AvailabilityRoom[]>([]);
  const [selectedRoom,setSelectedRoom]=useState("");
  const [checking,setChecking]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [actionError,setActionError]=useState("");
  const [now,setNow]=useState(Date.now());

  async function load(silent=false){
    if(!silent)setLoading(true);
    const r=await fetch("/api/reservations",{cache:"no-store"});
    if(r.status===401){window.location.href="/login";return}
    const p=await r.json().catch(()=>[]);
    if(r.ok&&Array.isArray(p))setRows(p);
    if(!silent)setLoading(false);
  }

  async function loadAvailability(){
    const from=new Date(checkin),to=new Date(checkout);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to){setRooms([]);return}
    setChecking(true);setError("");
    const r=await fetch("/api/reservations/availability?from="+encodeURIComponent(from.toISOString())+"&to="+encodeURIComponent(to.toISOString()),{cache:"no-store"});
    const p=await r.json().catch(()=>[]);
    if(r.ok&&Array.isArray(p)){
      setRooms(p);
      if(selectedRoom&&!p.some((x:AvailabilityRoom)=>x.id===selectedRoom&&x.available))setSelectedRoom("");
    }else setError("تعذر فحص توافر الغرف للفترة المختارة.");
    setChecking(false);
  }

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>{setNow(Date.now());void load(true)},30000);
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{if(createOpen)void loadAvailability()},[createOpen,checkin,checkout]);

  function resetCreate(){
    const d=defaultTimes();
    setGuestName("");setGuestPhone("");setCheckin(d.checkin);setCheckout(d.checkout);setNote("");setRooms([]);setSelectedRoom("");setError("");
  }

  async function createReservation(e:FormEvent){
    e.preventDefault();
    if(!selectedRoom){setError("اختر غرفة متاحة للفترة المحددة.");return}
    setSaving(true);setError("");
    const r=await fetch("/api/reservations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      roomId:selectedRoom,guestName:guestName.trim(),guestPhone:guestPhone.trim()||undefined,
      checkinAt:new Date(checkin).toISOString(),checkoutAt:new Date(checkout).toISOString(),note:note.trim()||undefined
    })});
    const p=await r.json().catch(()=>({}));
    if(!r.ok){
      const map:Record<string,string>={
        reservation_conflict:"الغرفة أصبح عليها حجز متداخل في نفس الفترة.",
        reservation_conflict_active_stay:"الإقامة الحالية للغرفة تتداخل مع موعد الحجز.",
        reservation_must_be_future:"موعد الدخول يجب أن يكون في المستقبل.",
        invalid_reservation_payload:"راجع اسم النزيل وموعد الدخول والخروج.",
        room_out_of_service:"الغرفة خارج الخدمة ولا يمكن حجزها."
      };
      setError(map[p.error]||"تعذر إنشاء الحجز.");setSaving(false);await loadAvailability();return;
    }
    setSaving(false);setCreateOpen(false);resetCreate();await load();
  }

  async function checkinReservation(row:Reservation){
    setActionError("");
    const r=await fetch("/api/reservations/"+encodeURIComponent(row.id)+"/checkin",{method:"POST"});
    const p=await r.json().catch(()=>({}));
    if(!r.ok){
      const map:Record<string,string>={
        checkin_too_early:"لا يمكن تسجيل الدخول الآن؛ يسمح قبل الموعد بساعتين فقط.",
        reservation_expired:"انتهت فترة الحجز؛ راجع الحجز قبل تسجيل الدخول.",
        room_not_available:"الغرفة ليست متاحة فعليًا الآن.",
        active_stay_exists:"يوجد نزيل حالي في الغرفة.",
        reservation_not_checkin_ready:"هذا الحجز لم يعد متاحًا لتسجيل الدخول."
      };
      setActionError(map[p.error]||"تعذر تسجيل دخول الحجز.");return;
    }
    await load();
  }

  async function cancelReservation(row:Reservation){
    if(!window.confirm("إلغاء حجز "+row.guest_name+" للغرفة "+row.room_number+"؟"))return;
    const r=await fetch("/api/reservations/"+encodeURIComponent(row.id)+"/cancel",{method:"POST"});
    if(!r.ok){setActionError("تعذر إلغاء الحجز.");return}
    await load();
  }

  function operationalState(row:Reservation){
    if(row.status==="checked_in")return {label:"تم تسجيل الدخول",className:"checked"};
    if(row.status==="cancelled")return {label:"ملغي",className:"cancelled"};
    const start=new Date(row.checkin_at).getTime(),end=new Date(row.checkout_at).getTime();
    if(now>=end)return {label:"متأخر الوصول",className:"late"};
    if(now>=start-2*60*60*1000)return {label:"جاهز للدخول",className:"ready"};
    return {label:"قادم",className:"upcoming"};
  }

  const filtered=useMemo(()=>rows.filter(row=>{
    const q=query.trim().toLowerCase();
    const match=!q||(row.guest_name+" "+(row.guest_phone||"")+" "+row.room_number).toLowerCase().includes(q);
    const scopeMatch=scope==="all"||scope==="checked_in"?row.status==="checked_in":scope==="cancelled"?row.status==="cancelled":row.status==="booked";
    return match&&scopeMatch;
  }),[rows,query,scope]);

  const counts={
    upcoming:rows.filter(x=>x.status==="booked"&&new Date(x.checkin_at).getTime()>now+2*60*60*1000).length,
    ready:rows.filter(x=>x.status==="booked"&&new Date(x.checkin_at).getTime()<=now+2*60*60*1000&&new Date(x.checkout_at).getTime()>now).length,
    late:rows.filter(x=>x.status==="booked"&&new Date(x.checkout_at).getTime()<=now).length,
    total:rows.filter(x=>x.status==="booked").length
  };

  return <main className="settings-page reservations-page">
    <header className="settings-header premium-page-head">
      <div><span className="section-kicker">RESERVATION CONTROL</span><h1>الحجوزات</h1><p>إدارة الحجوزات المستقبلية وفحص تعارض الغرف قبل تثبيت أي حجز.</p></div>
      <button className="primary-btn" onClick={()=>{resetCreate();setCreateOpen(true)}}><Plus size={18}/> حجز جديد</button>
    </header>
    {actionError?<div className="login-error page-error">{actionError}</div>:null}

    <section className="reservation-kpis">
      <div><CalendarBlank size={20}/><span>حجوزات قادمة</span><b>{counts.upcoming}</b></div>
      <div className="ready"><CheckCircle size={20}/><span>جاهزة للدخول</span><b>{counts.ready}</b></div>
      <div className="late"><Clock size={20}/><span>متأخرة الوصول</span><b>{counts.late}</b></div>
      <div><Bed size={20}/><span>إجمالي النشطة</span><b>{counts.total}</b></div>
    </section>

    <section className="panel reservations-directory">
      <div className="directory-toolbar">
        <div className="search wide"><MagnifyingGlass size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم النزيل أو الجوال أو الغرفة"/></div>
        <select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}>
          <option value="upcoming">الحجوزات النشطة</option><option value="checked_in">تم تسجيل الدخول</option><option value="cancelled">الملغاة</option><option value="all">كل السجل</option>
        </select>
      </div>

      {loading?<div className="rooms-state">جاري تحميل الحجوزات…</div>:filtered.length===0?<div className="empty-pro-state"><CalendarBlank size={30}/><b>لا توجد حجوزات مطابقة</b><span>أنشئ حجزًا جديدًا أو غيّر الفلتر.</span></div>:
      <div className="reservation-grid">{filtered.map(row=>{
        const state=operationalState(row);
        const canCheckin=row.status==="booked"&&new Date(row.checkin_at).getTime()<=now+2*60*60*1000&&new Date(row.checkout_at).getTime()>now;
        return <article className={"reservation-card "+state.className} key={row.id}>
          <header><div><span>غرفة</span><b>{row.room_number}</b><small>{row.room_type}</small></div><i>{state.label}</i></header>
          <div className="reservation-guest"><User size={16}/><div><b>{row.guest_name}</b><span><Phone size={12}/> {row.guest_phone||"غير مسجل"}</span></div></div>
          <div className="reservation-dates">
            <div><span>الدخول</span><b>{fmt(row.checkin_at)}</b></div>
            <div><span>الخروج</span><b>{fmt(row.checkout_at)}</b></div>
          </div>
          {row.note?<p className="reservation-note">{row.note}</p>:null}
          {row.status==="booked"?<footer>
            <button className="primary-btn" disabled={!canCheckin} onClick={()=>void checkinReservation(row)}>تسجيل الدخول</button>
            <button className="secondary-btn" onClick={()=>void cancelReservation(row)}>إلغاء الحجز</button>
          </footer>:null}
        </article>
      })}</div>}
    </section>

    <ModalFrame open={createOpen} onClose={()=>!saving&&setCreateOpen(false)} className="reservation-create-modal" ariaLabelledBy="reservation-create-title">
      <button className="close" onClick={()=>setCreateOpen(false)}><X size={19}/></button>
      <span className="section-kicker">NEW RESERVATION</span><h2 id="reservation-create-title">حجز مستقبلي جديد</h2>
      <p className="operation-sub">اختر الفترة أولًا؛ توافر الغرف يُحسب على كامل الفترة بدون تعارض.</p>
      <form onSubmit={createReservation}>
        <div className="reservation-form-grid">
          <label className="login-field"><span>اسم النزيل</span><div><User size={18}/><input value={guestName} onChange={e=>setGuestName(e.target.value)} required/></div></label>
          <label className="login-field"><span>رقم الجوال</span><div><Phone size={18}/><input dir="ltr" value={guestPhone} onChange={e=>setGuestPhone(e.target.value)} placeholder="05xxxxxxxx"/></div></label>
          <label className="login-field"><span>موعد الدخول</span><div><CalendarBlank size={18}/><input type="datetime-local" value={checkin} onChange={e=>setCheckin(e.target.value)} required/></div></label>
          <label className="login-field"><span>موعد الخروج</span><div><CalendarBlank size={18}/><input type="datetime-local" value={checkout} onChange={e=>setCheckout(e.target.value)} required/></div></label>
        </div>

        <div className="reservation-availability-head"><div><Bed size={17}/><b>اختيار الغرفة</b></div><span>{checking?"جاري فحص التوافر…":rooms.filter(r=>r.available).length+" غرفة متاحة للفترة"}</span></div>
        <div className="reservation-room-picker">
          {rooms.map(room=><button type="button" key={room.id} disabled={!room.available} className={(selectedRoom===room.id?"selected ":"")+(room.available?"available":"blocked")} onClick={()=>setSelectedRoom(room.id)}>
            <div><b>{room.number}</b><span>{room.room_type}</span></div>
            <small>{room.available?"متاحة":room.reason||"غير متاحة"}</small>
          </button>)}
        </div>

        <label className="premium-textarea"><span>ملاحظة الحجز <small>اختياري</small></span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="مثال: وصول متأخر أو طلب خاص"/></label>
        {error?<div className="login-error">{error}</div>:null}
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setCreateOpen(false)}>إلغاء</button><button className="primary-btn" disabled={saving||checking}>{saving?"جاري تثبيت الحجز…":"تأكيد الحجز"}</button></div>
      </form>
    </ModalFrame>
  </main>;
}
