"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Bed, Buildings, CalendarCheck, ChartBar, CheckCircle, Clock, DoorOpen,
  Gear, HouseLine, ListChecks, MagnifyingGlass, MoonStars, Package, Plus,
  ShieldCheck, SignOut, Sparkle, Users, X
} from "@phosphor-icons/react";
import { notifications, requests, rooms, type Room } from "@/lib/data";

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

  const filtered = useMemo(
    () => rooms.filter(r =>
      (activeFloor === "all" || r.floor === activeFloor) &&
      (r.number.includes(query) || (r.guest || "").includes(query))
    ),
    [activeFloor, query]
  );

  const occupied = rooms.filter(r => ["occupied","checkout","request"].includes(r.status)).length;
  const available = rooms.filter(r => r.status === "available").length;
  const checkout = rooms.filter(r => r.status === "checkout").length;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Sparkle size={20} weight="fill"/></div>
        <div><b>Roomora</b><span>Hotel Operations</span></div>
      </div>

      <nav>
        <button className="nav-item active"><HouseLine size={20}/> لوحة التشغيل</button>
        <button className="nav-item"><Bed size={20}/> الغرف والإقامات</button>
        <button className="nav-item"><ListChecks size={20}/> طلبات الغرف <em>3</em></button>
        <button className="nav-item"><Users size={20}/> النزلاء</button>
        <button className="nav-item"><Package size={20}/> المستهلكات</button>
        <button className="nav-item"><ChartBar size={20}/> التقارير</button>
        <div className="nav-sep" />
        <button className="nav-item"><ShieldCheck size={20}/> الموظفون والصلاحيات</button>
        <button className="nav-item"><Gear size={20}/> الإعدادات</button>
      </nav>

      <div className="shift-card">
        <div className="shift-icon"><MoonStars size={18}/></div>
        <div><span>الوردية الحالية</span><b>الوردية الليلية</b><small>22:00 — 06:00</small></div>
      </div>

      <div className="user-card">
        <div className="avatar">م</div>
        <div><b>مدير الفندق</b><span>Administrator</span></div>
        <SignOut size={18}/>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div>
          <p className="eyebrow">الأربعاء، 30 سبتمبر 2026</p>
          <h1>صباح الخير 👋</h1>
          <p className="sub">كل ما يحدث في الفندق أمامك الآن، بدون تشتيت.</p>
        </div>

        <div className="top-actions">
          <div className="business-day">
            <Clock size={18}/>
            <div><span>يوم الفندق</span><b>30 سبتمبر · يبدأ 06:00</b></div>
          </div>
          <button className="icon-btn" onClick={() => setNotifOpen(v=>!v)}><Bell size={21}/><i>3</i></button>
          <button className="primary-btn"><Plus size={18}/> تسجيل دخول نزيل</button>
        </div>

        <AnimatePresence>{notifOpen && <motion.div className="notif-pop" initial={{opacity:0,y:-8,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.98}}>
          <div className="notif-head"><b>الإشعارات</b><span>3 جديدة</span></div>
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
        <Stat icon={<CalendarCheck/>} label="خروج اليوم" value={String(checkout)} hint="حسب يوم الفندق" />
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
            {filtered.map((room,idx)=><motion.button
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
            <div className="request-list">{requests.map(r=><div className="request-row" key={r.id}>
              <div className={`request-icon ${r.level}`}><Bed size={18}/></div>
              <div className="request-info">
                <div><b>غرفة {r.room}</b><span>{r.age}</span></div>
                <p>{r.qty} × {r.item}</p><small>{r.status}</small>
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
            <div className="day-foot"><span>اليوم الحالي</span><b>30 سبتمبر 2026</b></div>
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
          <div className="guest-box"><span>النزيل الحالي</span><b>{selected.guest}</b><p>05•••••728</p></div>
          <div className="detail-grid">
            <div><span>تاريخ الدخول</span><b>29 سبتمبر · 16:32</b></div>
            <div><span>الخروج المتوقع</span><b>2 أكتوبر · 12:00</b></div>
            <div><span>مدة الإقامة</span><b>{selected.nights} ليالٍ</b></div>
            <div><span>يوم الفندق</span><b>30 سبتمبر</b></div>
          </div>
          <button className="primary-btn full"><Plus size={18}/> إضافة طلب للغرفة</button>
          <button className="secondary-btn full">تمديد الإقامة</button>
          <button className="danger-ghost full">تسجيل خروج النزيل</button>
        </> : <>
          <div className="empty-state"><CheckCircle size={32}/><b>الغرفة متاحة</b><p>لا توجد إقامة نشطة مرتبطة بهذه الغرفة.</p></div>
          <button className="primary-btn full"><Plus size={18}/> تسجيل دخول نزيل</button>
        </>}
      </motion.aside>
    </>}</AnimatePresence>
  </div>
}

function Stat({icon,label,value,hint,accent=false}:{icon:React.ReactNode,label:string,value:string,hint:string,accent?:boolean}) {
  return <motion.div className={`stat-card ${accent?"accent":""}`} whileHover={{y:-3}} transition={{duration:.18}}>
    <div className="stat-icon">{icon}</div>
    <div><span>{label}</span><b>{value}</b><small>{hint}</small></div>
  </motion.div>;
}
