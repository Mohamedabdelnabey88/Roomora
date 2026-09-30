"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Bed, Buildings, CalendarCheck, ChartBar, CheckCircle, Clock, DoorOpen,
  Gear, HouseLine, ListChecks, MagnifyingGlass, MoonStars, Package, Plus,
  ShieldCheck, SignOut, Sparkle, Users, X
} from "@phosphor-icons/react";
import { notifications, fallbackRooms, mapApiRoom, type ApiRoom, type Room } from "@/lib/data";
import { getHotelBusinessDay } from "@/lib/business-day";
import { CheckinDialog, ExtendStayDialog } from "@/components/StayDialogs";
import RequestDialog from "@/components/RequestDialog";
import RequestActions, { type ActiveRequest } from "@/components/RequestActions";

const labels = {
  available:"متاحة",
  occupied:"مشغولة",
  checkout:"خروج اليوم",
  request:"طلب مفتوح",
  cleaning:"تنظيف",
  maintenance:"صيانة"
} as const;

export default function Dashboard() {
  const [activeFloor, setActiveFloor] = useState<number | "all">("all");
  const [selected, setSelected] = useState<Room | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rooms, setRooms] = useState<Room[]>(fallbackRooms);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [checkinRoom, setCheckinRoom] = useState<Room | null>(null);
  const [extendRoom, setExtendRoom] = useState<Room | null>(null);
  const [requestRoom, setRequestRoom] = useState<Room | null>(null);
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([]);
  const [currentUser, setCurrentUser] = useState<{name:string;role:"admin"|"reception"}|null>(null);
  const [actionError, setActionError] = useState("");

  async function loadRooms() {
    setLoadingRooms(true);
    return fetch("/api/rooms", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { window.location.href = "/login"; throw new Error("unauthorized"); }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ApiRoom[]>;
      })
      .then((payload) => {
        setRooms(payload.map(mapApiRoom));
        setDataError(null);
      })
      .catch(() => setDataError("تعذر الاتصال بقاعدة بيانات الفندق"))
      .finally(() => setLoadingRooms(false));
  }

  async function loadRequests() {
    const response = await fetch("/api/requests",{cache:"no-store"});
    if (response.status === 401) { window.location.href="/login"; return; }
    const payload = await response.json().catch(()=>[]);
    setActiveRequests(Array.isArray(payload)?payload:[]);
  }

  async function loadCurrentUser() {
    const response = await fetch("/api/auth/me",{cache:"no-store"});
    if (response.status === 401) { window.location.href="/login"; return; }
    const payload = await response.json().catch(()=>null);
    if (payload?.user) setCurrentUser({name:payload.user.name,role:payload.user.role});
  }

  async function refreshOperations() {
    await Promise.all([loadRooms(),loadRequests()]);
  }

  useEffect(() => { void Promise.all([loadRooms(),loadRequests(),loadCurrentUser()]); }, []);

  function requestAgeMinutes(value:string) {
    return Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
  }

  function requestAge(value:string) {
    const mins=requestAgeMinutes(value);
    if (mins<1) return "الآن";
    if (mins<60) return "منذ "+mins+" د";
    return "منذ "+Math.floor(mins/60)+" س";
  }

  const requestStatusLabel:Record<string,string>={
    new:"جديد",
    acknowledged:"تم الاستلام",
    preparing:"جاري التجهيز",
    approval_required:"بانتظار موافقة",
    delivered:"تم التسليم",
    cancelled:"ملغي"
  };

  function formatStayDate(value?: string) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("ar-SA", {
      timeZone:"Asia/Riyadh",
      day:"numeric",
      month:"short",
      hour:"2-digit",
      minute:"2-digit"
    }).format(new Date(value));
  }

  function maskedPhone(value?: string) {
    if (!value) return "غير مسجل";
    const clean = value.replace(/\s+/g,"");
    if (clean.length < 5) return "••••";
    return clean.slice(0,2) + "•••••" + clean.slice(-3);
  }

  async function checkout(room: Room) {
    if (!room.stayId) return;
    if (!window.confirm("تأكيد تسجيل خروج النزيل من الغرفة " + room.number + "؟")) return;
    setActionError("");
    const response = await fetch("/api/stays/" + encodeURIComponent(room.stayId) + "/checkout", { method:"POST" });
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) {
      setActionError(payload.error === "active_stay_not_found" ? "الإقامة لم تعد نشطة" : "تعذر تسجيل الخروج");
      return;
    }
    setSelected(null);
    await loadRooms();
  }

  const filtered = useMemo(
    () => rooms.filter(r =>
      (activeFloor === "all" || r.floor === activeFloor) &&
      (r.number.includes(query) || (r.guest || "").includes(query))
    ),
    [rooms, activeFloor, query]
  );

  const occupied = rooms.filter(r => ["occupied","checkout","request"].includes(r.status)).length;
  const available = rooms.filter(r => r.status === "available").length;
  const checkoutCount = rooms.filter(r => r.status === "checkout").length;
  const businessDay = getHotelBusinessDay(new Date(), { timezone:"Asia/Riyadh", startHour:6, startMinute:0 });
  const todayLabel = new Intl.DateTimeFormat("ar-SA", { timeZone:"Asia/Riyadh", weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(new Date());

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Sparkle size={20} weight="fill"/></div>
        <div><b>Roomora</b><span>Hotel Operations</span></div>
      </div>

      <nav>
        <button className="nav-item active"><HouseLine size={20}/> لوحة التشغيل</button>
        <button className="nav-item"><Bed size={20}/> الغرف والإقامات</button>
        <button className="nav-item"><ListChecks size={20}/> طلبات الغرف {activeRequests.length > 0 && <em>{activeRequests.length}</em>}</button>
        <button className="nav-item"><Users size={20}/> النزلاء</button>
        <button className="nav-item"><Package size={20}/> المستهلكات</button>
        <button className="nav-item"><ChartBar size={20}/> التقارير</button>
        <div className="nav-sep" />
        <Link href="/employees" className="nav-item"><ShieldCheck size={20}/> الموظفون والصلاحيات</Link>
        <Link href="/settings" className="nav-item"><Gear size={20}/> الإعدادات</Link>
      </nav>

      <div className="shift-card">
        <div className="shift-icon"><MoonStars size={18}/></div>
        <div><span>الوردية الحالية</span><b>الوردية الليلية</b><small>22:00 — 06:00</small></div>
      </div>

      <div className="user-card">
        <div className="avatar">{(currentUser?.name || "م").slice(0,1)}</div>
        <div><b>{currentUser?.name || "مستخدم Roomora"}</b><span>{currentUser?.role==="admin"?"Administrator":"Reception"}</span></div>
        <button className="logout-icon" onClick={async()=>{ await fetch("/api/auth/logout",{method:"POST"}); window.location.href="/login"; }} aria-label="تسجيل الخروج"><SignOut size={18}/></button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>صباح الخير 👋</h1>
          <p className="sub">كل ما يحدث في الفندق أمامك الآن، بدون تشتيت.</p>
        </div>

        <div className="top-actions">
          <div className="business-day">
            <Clock size={18}/>
            <div><span>يوم الفندق</span><b>{businessDay.label} · يبدأ 06:00</b></div>
          </div>
          <button className="icon-btn" onClick={() => setNotifOpen(v=>!v)}><Bell size={21}/>{notifications.length > 0 && <i>{notifications.length}</i>}</button>
          <button className="primary-btn" onClick={()=>{
            const firstAvailable=rooms.find(r=>r.status==="available");
            if (firstAvailable) setCheckinRoom(firstAvailable);
            else setActionError("لا توجد غرفة متاحة حاليًا");
          }}><Plus size={18}/> تسجيل دخول نزيل</button>
        </div>

        <AnimatePresence>{notifOpen && <motion.div className="notif-pop" initial={{opacity:0,y:-8,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.98}}>
          <div className="notif-head"><b>الإشعارات</b><span>{notifications.length} جديدة</span></div>
          {notifications.map((n,i)=><div className="notif-row" key={i}>
            <span className={`dot ${n.tone}`}/>
            <div><b>{n.title}</b><p>{n.body}</p></div>
          </div>)}
          <button className="text-btn">عرض مركز الإشعارات</button>
        </motion.div>}</AnimatePresence>
      </header>

      <section className="stats-grid">
        <Stat icon={<Buildings/>} label="إجمالي الغرف" value={String(rooms.length)} hint="4 أنواع سكن" />
        <Stat icon={<DoorOpen/>} label="الغرف المشغولة" value={String(occupied)} hint="الإشغال الحالي" accent />
        <Stat icon={<CheckCircle/>} label="الغرف المتاحة" value={String(available)} hint="جاهزة للتسكين" />
        <Stat icon={<CalendarCheck/>} label="خروج اليوم" value={String(checkoutCount)} hint="حسب يوم الفندق" />
      </section>

      <section className="content-grid">
        <div className="panel rooms-panel">
          <div className="panel-head">
            <div><span className="section-kicker">LIVE ROOM MAP</span><h2>حالة الغرف</h2></div>
            <div className="room-tools">
              <div className="search">
                <MagnifyingGlass size={17}/>
                <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث برقم الغرفة أو النزيل"/>
              </div>
            </div>
          </div>

          <div className="floor-tabs">
            {[["all","الكل"],[0,"الأرضي"],[1,"الأول"],[2,"الثاني"],[3,"الثالث"],[4,"الرابع"]].map(([v,l]) =>
              <button key={String(v)} className={activeFloor===v?"active":""} onClick={()=>setActiveFloor(v as number|"all")}>{l}</button>
            )}
          </div>

          <div className="legend">{Object.entries(labels).map(([k,v]) =>
            <span key={k}><i className={`status-dot ${k}`}/>{v}</span>
          )}</div>

          <motion.div layout className="room-grid">
            {loadingRooms && <div className="rooms-state">جاري تحميل الغرف من Cloudflare D1…</div>}
            {!loadingRooms && dataError && <div className="rooms-state error">{dataError}</div>}
            {!loadingRooms && !dataError && filtered.map((room,idx)=><motion.button
              layout
              initial={{opacity:0,y:8}}
              animate={{opacity:1,y:0}}
              transition={{delay:Math.min(idx*.012,.2)}}
              key={room.number}
              className={`room-card ${room.status}`}
              onClick={()=>setSelected(room)}
            >
              <div className="room-top"><b>{room.number}</b><span>{labels[room.status]}</span></div>
              <small>{room.type}</small>
              <div className="room-meta">
                {room.guest
                  ? <><p>{room.guest}</p><span>{room.nights} {room.nights===1?"ليلة":"ليالٍ"}{room.openRequests ? ` · ${room.openRequests} طلب` : ""}</span></>
                  : <><p>جاهزة للاستقبال</p><span>لا توجد إقامة حالية</span></>}
              </div>
            </motion.button>)}
          </motion.div>
        </div>

        <div className="side-stack">
          <div className="panel requests-panel">
            <div className="panel-head compact">
              <div><span className="section-kicker">SERVICE DESK</span><h2>الطلبات النشطة</h2></div>
              <button className="text-btn">عرض الكل</button>
            </div>
            <div className="request-list">{activeRequests.length===0
              ? <div className="requests-empty">لا توجد طلبات نشطة حاليًا.</div>
              : activeRequests.map(r=><div className="request-row" key={r.id}>
              <div className={`request-icon ${requestAgeMinutes(r.requested_at)>=25?"critical":requestAgeMinutes(r.requested_at)>=15?"warning":r.priority}`}><Bed size={18}/></div>
              <div className="request-info">
                <div><b>غرفة {r.room_number}</b><span>{requestAge(r.requested_at)}</span></div>
                <p>{r.items || "طلب غرفة"}</p>
                <small>{requestStatusLabel[r.status] || r.status}</small>
                {r.approval_reason && <div className="approval-reason">{r.approval_reason}</div>}
                <RequestActions request={r} role={currentUser?.role || null} onChanged={refreshOperations}/>
              </div>
            </div>)}</div>
          </div>

          <div className="panel day-panel">
            <div className="day-hero">
              <div className="day-icon"><Clock size={24}/></div>
              <div><span>إغلاق اليوم تلقائيًا</span><b>06:00 صباحًا</b></div>
            </div>
            <p>الطلبات غير المكتملة تُرحّل تلقائيًا لليوم التالي بدون فقد أي سجل.</p>
            <div className="day-progress"><div style={{width:"78%"}}/></div>
            <div className="day-foot"><span>اليوم الحالي</span><b>{businessDay.label}</b></div>
          </div>
        </div>
      </section>
    </main>

    <AnimatePresence>{selected && <>
      <motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setSelected(null)}/>
      <motion.aside className="drawer" initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{type:"spring",damping:28,stiffness:260}}>
        <button className="close" onClick={()=>setSelected(null)}><X size={20}/></button>
        <div className="drawer-room">
          <span>{selected.type}</span>
          <h3>الغرفة {selected.number}</h3>
          <i className={`pill ${selected.status}`}>{labels[selected.status]}</i>
        </div>

        {selected.guest ? <>
          <div className="guest-box"><span>النزيل الحالي</span><b>{selected.guest}</b><p>{maskedPhone(selected.guestPhone)}</p></div>
          <div className="detail-grid">
            <div><span>تاريخ الدخول</span><b>{formatStayDate(selected.checkinAt)}</b></div>
            <div><span>الخروج المتوقع</span><b>{formatStayDate(selected.expectedCheckoutAt)}</b></div>
            <div><span>مدة الإقامة</span><b>{selected.nights} ليالٍ</b></div>
            <div><span>يوم الفندق</span><b>{businessDay.label}</b></div>
          </div>
          <button className="primary-btn full" onClick={()=>setRequestRoom(selected)}><Plus size={18}/> إضافة طلب للغرفة</button>
          <button className="secondary-btn full" onClick={()=>setExtendRoom(selected)}>تمديد الإقامة</button>
          <button className="danger-ghost full" onClick={()=>void checkout(selected)}>تسجيل خروج النزيل</button>
        </> : <>
          <div className="empty-state"><CheckCircle size={32}/><b>الغرفة متاحة</b><p>لا توجد إقامة نشطة مرتبطة بهذه الغرفة.</p></div>
          <button className="primary-btn full" onClick={()=>setCheckinRoom(selected)}><Plus size={18}/> تسجيل دخول نزيل</button>
        </>}
      </motion.aside>
    </>}</AnimatePresence>

    {actionError && <div className="action-toast" onClick={()=>setActionError("")}>{actionError}</div>}

    <CheckinDialog
      room={checkinRoom}
      onClose={()=>setCheckinRoom(null)}
      onSuccess={async()=>{ setSelected(null); await loadRooms(); }}
    />
    <ExtendStayDialog
      room={extendRoom}
      onClose={()=>setExtendRoom(null)}
      onSuccess={async()=>{ setSelected(null); await loadRooms(); }}
    />
    <RequestDialog
      room={requestRoom}
      onClose={()=>setRequestRoom(null)}
      onSuccess={async(result)=>{
        await refreshOperations();
        if (result.requiresApproval) {
          setActionError("تم تسجيل الطلب وتحويله لموافقة الإدارة بسبب تجاوز أحد الحدود.");
        }
      }}
    />
  </div>
}

function Stat({icon,label,value,hint,accent=false}:{icon:React.ReactNode,label:string,value:string,hint:string,accent?:boolean}) {
  return <motion.div className={`stat-card ${accent?"accent":""}`} whileHover={{y:-3}} transition={{duration:.18}}>
    <div className="stat-icon">{icon}</div>
    <div><span>{label}</span><b>{value}</b><small>{hint}</small></div>
  </motion.div>;
}
