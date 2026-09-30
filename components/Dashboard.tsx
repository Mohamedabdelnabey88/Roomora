"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Bed, Buildings, CalendarCheck, ChartBar, CheckCircle, Clock, DoorOpen,
  Gear, HouseLine, ListChecks, MagnifyingGlass, MoonStars, Package, Plus,
  ShieldCheck, SignOut, Sparkle, Users, X
} from "@phosphor-icons/react";
import { fallbackRooms, mapApiRoom, type ApiRoom, type Room } from "@/lib/data";
import { getHotelBusinessDay } from "@/lib/business-day";
import { CheckinDialog, ExtendStayDialog } from "@/components/StayDialogs";
import RequestDialog from "@/components/RequestDialog";
import RequestActions, { type ActiveRequest } from "@/components/RequestActions";
import { notifyOperationsChanged, subscribeOperationsChanged } from "@/lib/operations-events";

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
  const [statusFilter, setStatusFilter] = useState<"all"|Room["status"]>("all");
  const [lastSync, setLastSync] = useState<Date|null>(null);

  async function loadRooms() {
    setLoadingRooms(true);
    return fetch("/api/rooms", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { window.location.href = "/login"; throw new Error("unauthorized"); }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ApiRoom[]>;
      })
      .then((payload) => {
        const mapped = payload.map(mapApiRoom);
        setRooms(mapped);
        setSelected(prev => prev ? (mapped.find(room => room.id === prev.id) || null) : null);
        setDataError(null);
        setLastSync(new Date());
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

  useEffect(() => {
    void Promise.all([loadRooms(),loadRequests(),loadCurrentUser()]);
    const refresh = () => { void refreshOperations(); };
    const timer = window.setInterval(refresh, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const unsubscribe = subscribeOperationsChanged(refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribe();
    };
  }, []);

  function requestAgeMinutes(value:string) {
    return Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
  }

  function requestAge(value:string) {
    const mins=requestAgeMinutes(value);
    if (mins<1) return "الآن";
    if (mins<60) return "منذ "+mins+" د";
    return "منذ "+Math.floor(mins/60)+" س";
  }

  const liveNotifications = activeRequests
    .map(r=>{
      const mins=requestAgeMinutes(r.requested_at);
      if (r.status==="approval_required") {
        return { title:"طلب يحتاج موافقة", body:"الغرفة "+r.room_number+" · "+(r.items || "طلب غرفة"), tone:"warning" as const };
      }
      if (mins>=25) {
        return { title:"طلب متأخر بشكل حرج", body:"الغرفة "+r.room_number+" · "+requestAge(r.requested_at), tone:"critical" as const };
      }
      if (mins>=15) {
        return { title:"طلب تجاوز وقت التنبيه", body:"الغرفة "+r.room_number+" · "+requestAge(r.requested_at), tone:"warning" as const };
      }
      return null;
    })
    .filter(Boolean) as Array<{title:string;body:string;tone:"critical"|"warning"|"info"}>;

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
      if (payload.error === "active_stay_not_found") {
        setActionError("الإقامة لم تعد نشطة");
      } else if (payload.error === "open_requests_exist") {
        setActionError("لا يمكن تسجيل الخروج قبل إغلاق الطلبات النشطة للغرفة (" + String(payload.count || 0) + ").");
      } else {
        setActionError("تعذر تسجيل الخروج");
      }
      return;
    }
    setSelected(null);
    notifyOperationsChanged();
    await refreshOperations();
  }

  const filtered = useMemo(
    () => rooms.filter(r =>
      (activeFloor === "all" || r.floor === activeFloor) &&
      (statusFilter === "all" || r.status === statusFilter || (statusFilter === "occupied" && ["occupied","checkout","request"].includes(r.status))) &&
      (r.number.includes(query) || (r.guest || "").includes(query))
    ),
    [rooms, activeFloor, statusFilter, query]
  );

  // Stay presence is the source of truth for occupancy. Visual room status can
  // temporarily become "request" or "checkout" while the room is still occupied.
  const occupied = rooms.filter(r => Boolean(r.stayId)).length;
  const available = rooms.filter(r => !r.stayId && r.status === "available").length;
  const checkoutCount = rooms.filter(r => Boolean(r.stayId) && r.status === "checkout").length;
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
        <Link href="/rooms" className="nav-item"><Bed size={20}/> الغرف والإقامات</Link>
        <Link href="/requests" className="nav-item"><ListChecks size={20}/> طلبات الغرف {activeRequests.length > 0 && <em>{activeRequests.length}</em>}</Link>
        <Link href="/guests" className="nav-item"><Users size={20}/> النزلاء</Link>
        <button className="nav-item"><Package size={20}/> المستهلكات</button>
        <Link href="/reports" className="nav-item"><ChartBar size={20}/> التقارير</Link>
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
          <button className="icon-btn" onClick={() => setNotifOpen(v=>!v)}><Bell size={21}/>{liveNotifications.length > 0 && <i>{liveNotifications.length}</i>}</button>
          <button className="primary-btn" onClick={()=>{
            const firstAvailable=rooms.find(r=>r.status==="available");
            if (firstAvailable) setCheckinRoom(firstAvailable);
            else setActionError("لا توجد غرفة متاحة حاليًا");
          }}><Plus size={18}/> تسجيل دخول نزيل</button>
        </div>

        <AnimatePresence>{notifOpen && <motion.div className="notif-pop" initial={{opacity:0,y:-8,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.98}}>
          <div className="notif-head"><b>الإشعارات</b><span>{liveNotifications.length} جديدة</span></div>
          {liveNotifications.length===0 && <div className="requests-empty">لا توجد تنبيهات تشغيلية حاليًا.</div>}
          {liveNotifications.map((n,i)=><div className="notif-row" key={i}>
            <span className={`dot ${n.tone}`}/>
            <div><b>{n.title}</b><p>{n.body}</p></div>
          </div>)}
          <button className="text-btn">عرض مركز الإشعارات</button>
        </motion.div>}</AnimatePresence>
      </header>

      <section className="stats-grid">
        <Stat icon={<Buildings/>} label="إجمالي الغرف" value={String(rooms.length)} hint="4 أنواع سكن" active={statusFilter==="all"} onClick={()=>setStatusFilter("all")} />
        <Stat icon={<DoorOpen/>} label="الغرف المشغولة" value={String(occupied)} hint="الإشغال الحالي" accent active={statusFilter==="occupied"} onClick={()=>setStatusFilter("occupied")} />
        <Stat icon={<CheckCircle/>} label="الغرف المتاحة" value={String(available)} hint="جاهزة للتسكين" active={statusFilter==="available"} onClick={()=>setStatusFilter("available")} />
        <Stat icon={<CalendarCheck/>} label="خروج اليوم" value={String(checkoutCount)} hint="حسب يوم الفندق" active={statusFilter==="checkout"} onClick={()=>setStatusFilter("checkout")} />
      </section>
      <div className="live-sync-row"><span className="live-dot"/> بيانات مباشرة من D1 {lastSync ? "· آخر تحديث "+lastSync.toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : ""}</div>

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
            {!loadingRooms && !dataError && filtered.map((room,idx)=><motion.article
              layout
              initial={{opacity:0,y:10}}
              animate={{opacity:1,y:0}}
              transition={{delay:Math.min(idx*.01,.16)}}
              key={room.number}
              className={`room-card room-card-pro ${room.status}`}
              onClick={()=>setSelected(room)}
            >
              <div className="room-card-head">
                <div className="room-number-block">
                  <span>غرفة</span>
                  <b>{room.number}</b>
                </div>
                <span className={`room-status-chip ${room.status}`}>
                  <i className={`status-dot ${room.status}`}/>
                  {labels[room.status]}
                </span>
              </div>

              <div className="room-type-row"><Bed size={15}/><span>{room.type}</span></div>

              {room.guest ? (
                <div className="room-occupancy guest">
                  <div className="room-avatar">{room.guest.trim().charAt(0)}</div>
                  <div>
                    <span>النزيل الحالي</span>
                    <b>{room.guest}</b>
                    <small>{room.nights} {room.nights===1?"ليلة":"ليالٍ"}{room.openRequests ? ` · ${room.openRequests} طلب مفتوح` : ""}</small>
                  </div>
                </div>
              ) : (
                <div className="room-occupancy vacant">
                  <CheckCircle size={20} weight="fill"/>
                  <div><b>جاهزة للتسكين</b><span>لا توجد إقامة نشطة</span></div>
                </div>
              )}

              <div className="room-quick-actions">
                <button type="button" className="room-action subtle" onClick={e=>{e.stopPropagation();setSelected(room);}}>
                  التفاصيل
                </button>
                {!room.guest && room.status==="available" && (
                  <button type="button" className="room-action primary" onClick={e=>{e.stopPropagation();setCheckinRoom(room);}}>
                    <DoorOpen size={14}/> تسكين
                  </button>
                )}
                {room.guest && (
                  <button type="button" className="room-action primary" onClick={e=>{e.stopPropagation();setRequestRoom(room);}}>
                    <Plus size={14}/> طلب
                  </button>
                )}
              </div>
            </motion.article>)}
          </motion.div>
        </div>

        <div className="side-stack">
          <div className="panel requests-panel">
            <div className="panel-head compact">
              <div><span className="section-kicker">SERVICE DESK</span><h2>الطلبات النشطة</h2></div>
              <Link href="/requests" className="text-btn">عرض الكل</Link>
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
      onSuccess={async()=>{ setSelected(null); notifyOperationsChanged(); await refreshOperations(); }}
    />
    <ExtendStayDialog
      room={extendRoom}
      onClose={()=>setExtendRoom(null)}
      onSuccess={async()=>{ setSelected(null); notifyOperationsChanged(); await refreshOperations(); }}
    />
    <RequestDialog
      room={requestRoom}
      onClose={()=>setRequestRoom(null)}
      onSuccess={async(result)=>{
        notifyOperationsChanged();
        await refreshOperations();
        if (result.requiresApproval) {
          setActionError("تم تسجيل الطلب وتحويله لموافقة الإدارة بسبب تجاوز أحد الحدود.");
        }
      }}
    />
  </div>
}

function Stat({icon,label,value,hint,accent=false,active=false,onClick}:{icon:React.ReactNode,label:string,value:string,hint:string,accent?:boolean,active?:boolean,onClick?:()=>void}) {
  return <motion.button type="button" onClick={onClick} className={`stat-card stat-button ${accent?"accent":""} ${active?"selected":""}`} whileHover={{y:-3}} transition={{duration:.18}}>
    <div className="stat-icon">{icon}</div>
    <div><span>{label}</span><b>{value}</b><small>{hint}</small></div>
  </motion.button>;
}
