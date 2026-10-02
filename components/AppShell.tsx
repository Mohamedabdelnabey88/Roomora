"use client";

import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bed,Bell,CalendarBlank,ChartBar,Gear,HouseLine,ListChecks,MoonStars,Package,
  ShieldCheck,SignOut,Sparkle,Users
} from "@phosphor-icons/react";

type UserInfo={name:string;role:"admin"|"reception"};

const items=[
  {href:"/",label:"لوحة التشغيل",icon:HouseLine},
  {href:"/rooms",label:"الغرف والإقامات",icon:Bed},
  {href:"/reservations",label:"الحجوزات",icon:CalendarBlank},
  {href:"/requests",label:"طلبات الغرف",icon:ListChecks},
  {href:"/notifications",label:"مركز الإشعارات",icon:Bell},
  {href:"/guests",label:"النزلاء",icon:Users},
  {href:"/consumables",label:"المستهلكات",icon:Package},
  {href:"/reports",label:"التقارير",icon:ChartBar},
  {href:"/employees",label:"الموظفون والصلاحيات",icon:ShieldCheck,admin:true},
  {href:"/settings",label:"الإعدادات",icon:Gear,admin:true}
];

export default function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const [user,setUser]=useState<UserInfo|null>(null);
  const [requestCount,setRequestCount]=useState(0);

  useEffect(()=>{
    let mounted=true;
    Promise.all([
      fetch("/api/auth/me",{cache:"no-store"}),
      fetch("/api/requests",{cache:"no-store"})
    ]).then(async([meRes,reqRes])=>{
      if(meRes.status===401){window.location.href="/login";return;}
      const me=await meRes.json().catch(()=>null);
      const req=await reqRes.json().catch(()=>[]);
      if(!mounted)return;
      if(me?.user)setUser({name:me.user.name,role:me.user.role});
      if(Array.isArray(req))setRequestCount(req.filter((r:{status:string})=>!["delivered","cancelled"].includes(r.status)).length);
    }).catch(()=>{});
    return()=>{mounted=false};
  },[]);

  const visible=useMemo(()=>items.filter(i=>!i.admin||user?.role==="admin"),[user?.role]);

  async function logout(){
    await fetch("/api/auth/logout",{method:"POST"}).catch(()=>null);
    window.location.href="/login";
  }

  return <div className="app-shell workspace-shell">
    <aside className="sidebar workspace-sidebar">
      <Link href="/" className="brand brand-link">
        <div className="brand-mark"><Sparkle size={20} weight="fill"/></div>
        <div><b>Roomora</b><span>Hotel Operations</span></div>
      </Link>

      <nav>
        {visible.map(item=>{
          const Icon=item.icon;
          const active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} className={"nav-item "+(active?"active":"")}>
            <Icon size={20}/><span>{item.label}</span>
            {item.href==="/requests"&&requestCount>0?<em>{requestCount}</em>:null}
          </Link>
        })}
      </nav>

      <div className="shift-card">
        <div className="shift-icon"><MoonStars size={18}/></div>
        <div><span>الوردية الحالية</span><b>الوردية الليلية</b><small>22:00 — 06:00</small></div>
      </div>

      <div className="user-card">
        <div className="avatar">{(user?.name||"م").slice(0,1)}</div>
        <div><b>{user?.name||"مستخدم Roomora"}</b><span>{user?.role==="admin"?"Administrator":"Reception"}</span></div>
        <button className="logout-icon" onClick={()=>void logout()} aria-label="تسجيل الخروج"><SignOut size={18}/></button>
      </div>
    </aside>

    <div className="main workspace-main">{children}</div>

    <nav className="mobile-dock" aria-label="التنقل السريع">
      {items.slice(0,5).map(item=>{
        const Icon=item.icon;
        const active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} className={active?"active":""}>
          <Icon size={20}/><span>{item.href==="/rooms"?"الغرف":item.href==="/requests"?"الطلبات":item.label}</span>
        </Link>
      })}
    </nav>
  </div>
}
