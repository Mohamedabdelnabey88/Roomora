"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { Package,ShieldCheck,SlidersHorizontal } from "@phosphor-icons/react";

type Item={id:string;name:string;unit:string;max_per_request:number|null;max_per_business_day:number|null;max_per_stay:number|null};

export default function ConsumablesPanel(){
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [role,setRole]=useState<"admin"|"reception"|null>(null);

  useEffect(()=>{(async()=>{
    const [r,u]=await Promise.all([
      fetch("/api/request-items",{cache:"no-store"}),
      fetch("/api/auth/me",{cache:"no-store"})
    ]);
    if(r.status===401||u.status===401){window.location.href="/login";return}
    const data=await r.json().catch(()=>[]);
    const me=await u.json().catch(()=>null);
    if(!r.ok||!Array.isArray(data)){setError("تعذر تحميل المستهلكات");setLoading(false);return}
    setItems(data);setRole(me?.user?.role||null);setLoading(false);
  })()},[]);

  return <main className="settings-page consumables-page">
    <header className="settings-header premium-page-head">
      <div><span className="section-kicker">HOUSEKEEPING INVENTORY</span><h1>المستهلكات وحدود الطلب</h1><p>الأصناف المتاحة وحدود الاستخدام الفعلية المرتبطة بطلبات الغرف.</p></div>
      {role==="admin"?<Link className="primary-btn" href="/settings"><SlidersHorizontal size={18}/> تعديل الحدود</Link>:null}
    </header>

    {loading?<div className="rooms-state">جاري تحميل المستهلكات…</div>:error?<div className="rooms-state error">{error}</div>:
    <section className="consumables-grid">
      {items.map(item=><article className="consumable-card" key={item.id}>
        <div className="consumable-head"><div className="consumable-icon"><Package size={22}/></div><div><b>{item.name}</b><span>{item.unit}</span></div></div>
        <div className="limit-metrics">
          <div><span>لكل طلب</span><b>{item.max_per_request??"—"}</b></div>
          <div><span>لكل يوم</span><b>{item.max_per_business_day??"—"}</b></div>
          <div><span>لكل إقامة</span><b>{item.max_per_stay??"—"}</b></div>
        </div>
        <div className="approval-note"><ShieldCheck size={14}/> التجاوز يحوّل الطلب لموافقة الإدارة</div>
      </article>)}
    </section>}
  </main>
}
