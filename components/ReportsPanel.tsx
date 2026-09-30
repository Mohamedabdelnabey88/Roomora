"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { ArrowRight,ChartBar,DoorOpen,ListChecks,Package,Users } from "@phosphor-icons/react";

type Summary={
  businessDay:string;
  roomStats:{total_rooms:number;available_rooms:number;occupied_rooms:number};
  stayStats:{in_house:number;checked_out_total:number;checkins_today:number;checkouts_today:number};
  requestStats:{total_requests:number;requests_today:number;awaiting_approval:number;active_requests:number;avg_delivery_minutes:number|null};
  topItems:Array<{name:string;quantity:number}>;
};

export default function ReportsPanel(){
  const [data,setData]=useState<Summary|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{(async()=>{
    const r=await fetch("/api/reports/summary",{cache:"no-store"});
    if(r.status===401){window.location.href="/login";return;}
    const p=await r.json().catch(()=>null);
    if(!r.ok||!p){setError("تعذر تحميل التقارير");return;}
    setData(p);
  })();},[]);

  return <main className="settings-page">
    <header className="settings-header"><div><Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link><span className="section-kicker">OPERATIONS REPORTS</span><h1>التقارير التشغيلية</h1><p>مؤشرات الإشغال والإقامات وطلبات الغرف من البيانات الفعلية.</p></div></header>
    {error?<div className="rooms-state error">{error}</div>:!data?<div className="rooms-state">جاري تحميل التقرير…</div>:<>
      <section className="request-kpis">
        <div><DoorOpen size={19}/><span>الغرف المشغولة</span><b>{data.roomStats.occupied_rooms||0}</b></div>
        <div><Users size={19}/><span>النزلاء الحاليون</span><b>{data.stayStats.in_house||0}</b></div>
        <div><ListChecks size={19}/><span>طلبات اليوم</span><b>{data.requestStats.requests_today||0}</b></div>
      </section>
      <div className="settings-grid">
        <section className="panel settings-card"><div className="settings-title"><div className="settings-icon"><ChartBar size={20}/></div><div><h2>ملخص التشغيل</h2><p>يوم الفندق {data.businessDay}</p></div></div>
          <div className="report-metrics"><div><span>إجمالي الغرف</span><b>{data.roomStats.total_rooms||0}</b></div><div><span>المتاحة</span><b>{data.roomStats.available_rooms||0}</b></div><div><span>دخول اليوم</span><b>{data.stayStats.checkins_today||0}</b></div><div><span>خروج اليوم</span><b>{data.stayStats.checkouts_today||0}</b></div></div>
        </section>
        <section className="panel settings-card"><div className="settings-title"><div className="settings-icon"><ListChecks size={20}/></div><div><h2>أداء الطلبات</h2><p>المسار التشغيلي للخدمة</p></div></div>
          <div className="report-metrics"><div><span>نشطة</span><b>{data.requestStats.active_requests||0}</b></div><div><span>بانتظار موافقة</span><b>{data.requestStats.awaiting_approval||0}</b></div><div><span>إجمالي الطلبات</span><b>{data.requestStats.total_requests||0}</b></div><div><span>متوسط التسليم</span><b>{data.requestStats.avg_delivery_minutes==null?"—":Math.round(data.requestStats.avg_delivery_minutes)+" د"}</b></div></div>
        </section>
      </div>
      <section className="panel limits-card"><div className="settings-title"><div className="settings-icon"><Package size={20}/></div><div><h2>أكثر المستهلكات طلبًا</h2><p>حسب الكميات الفعلية غير الملغاة.</p></div></div>
        <div className="top-items">{data.topItems.map((x,i)=><div key={x.name}><span>{i+1}</span><b>{x.name}</b><em>{x.quantity}</em></div>)}</div>
      </section>
    </>}
  </main>;
}
