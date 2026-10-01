"use client";

import { useEffect,useMemo,useState } from "react";
import { ChartBar,DoorOpen,FilePdf,ListChecks,Package,Users } from "@phosphor-icons/react";

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
  const [generatedAt,setGeneratedAt]=useState<Date|null>(null);

  async function load(){
    setError("");
    const r=await fetch("/api/reports/summary",{cache:"no-store"});
    if(r.status===401){window.location.href="/login";return}
    const p=await r.json().catch(()=>null);
    if(!r.ok||!p){setError("تعذر تحميل التقارير");return}
    setData(p);setGeneratedAt(new Date());
  }
  useEffect(()=>{void load()},[]);

  const occupancy=useMemo(()=>!data||!data.roomStats.total_rooms?0:Math.round((data.stayStats.in_house/data.roomStats.total_rooms)*100),[data]);

  function downloadCsv(){
    if(!data)return;
    const rows=[
      ["Roomora - تقرير التشغيل"],["يوم الفندق",data.businessDay],
      ["إجمالي الغرف",data.roomStats.total_rooms],["الغرف المشغولة",data.stayStats.in_house],["الغرف المتاحة",data.roomStats.available_rooms],
      ["دخول اليوم",data.stayStats.checkins_today],["خروج اليوم",data.stayStats.checkouts_today],
      ["طلبات اليوم",data.requestStats.requests_today],["طلبات نشطة",data.requestStats.active_requests],["بانتظار موافقة",data.requestStats.awaiting_approval],
      ["متوسط التسليم بالدقائق",data.requestStats.avg_delivery_minutes==null?"":Math.round(data.requestStats.avg_delivery_minutes)],
      [],["الصنف","الكمية"],...data.topItems.map(x=>[x.name,x.quantity])
    ];
    const csv="\uFEFF"+rows.map(row=>row.map(v=>"\""+String(v??"").replaceAll("\"","\"\"")+"\"").join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="roomora-report-"+data.businessDay+".csv";a.click();URL.revokeObjectURL(url);
  }

  return <main className="settings-page report-print-page">
    <header className="settings-header premium-page-head report-page-head"><div><span className="section-kicker">OPERATIONS INTELLIGENCE</span><h1>التقرير التشغيلي</h1><p>ملخص يوم الفندق من بيانات الإقامات وطلبات الخدمة الفعلية.</p></div><div className="report-actions"><button className="secondary-btn" onClick={downloadCsv}>تنزيل Excel / CSV</button><button className="primary-btn print-report-btn" onClick={()=>window.print()}><FilePdf size={18}/> حفظ PDF / طباعة</button></div></header>

    {error?<div className="rooms-state error">{error}</div>:!data?<div className="rooms-state">جاري تجهيز التقرير…</div>:<>
      <section className="report-document-head"><div><b>Roomora</b><span>Hotel Operations Report</span></div><div><span>يوم الفندق</span><b>{data.businessDay}</b><small>{generatedAt?"تم الإنشاء "+generatedAt.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"}):""}</small></div></section>

      <section className="report-hero-grid">
        <article><DoorOpen size={22}/><div><span>الإشغال الحالي</span><b>{data.stayStats.in_house} <small>/ {data.roomStats.total_rooms}</small></b><em>{occupancy}%</em></div></article>
        <article><Users size={22}/><div><span>دخول اليوم</span><b>{data.stayStats.checkins_today}</b><small>نزيل / إقامة</small></div></article>
        <article><Users size={22}/><div><span>خروج اليوم</span><b>{data.stayStats.checkouts_today}</b><small>خروج مكتمل</small></div></article>
        <article><ListChecks size={22}/><div><span>طلبات اليوم</span><b>{data.requestStats.requests_today}</b><small>{data.requestStats.active_requests} نشط الآن</small></div></article>
      </section>

      <section className="panel report-section occupancy-section">
        <div className="report-section-title"><div><ChartBar size={20}/><div><h2>الإشغال والغرف</h2><p>صورة تشغيلية للحالة الحالية.</p></div></div><strong>{occupancy}% إشغال</strong></div>
        <div className="occupancy-bar"><span style={{width:occupancy+"%"}}/></div>
        <div className="report-metrics pro-report-metrics"><div><span>إجمالي الغرف</span><b>{data.roomStats.total_rooms}</b></div><div><span>متاحة</span><b>{data.roomStats.available_rooms}</b></div><div><span>داخل الفندق</span><b>{data.stayStats.in_house}</b></div><div><span>إجمالي المغادرات</span><b>{data.stayStats.checked_out_total}</b></div></div>
      </section>

      <div className="report-two-col">
        <section className="panel report-section"><div className="report-section-title"><div><ListChecks size={20}/><div><h2>أداء الخدمة</h2><p>حركة طلبات الغرف.</p></div></div></div><div className="report-metrics pro-report-metrics"><div><span>طلبات نشطة</span><b>{data.requestStats.active_requests}</b></div><div><span>بانتظار موافقة</span><b>{data.requestStats.awaiting_approval}</b></div><div><span>إجمالي الطلبات</span><b>{data.requestStats.total_requests}</b></div><div><span>متوسط التسليم</span><b>{data.requestStats.avg_delivery_minutes==null?"—":Math.round(data.requestStats.avg_delivery_minutes)+" د"}</b></div></div></section>
        <section className="panel report-section"><div className="report-section-title"><div><Package size={20}/><div><h2>الأصناف الأعلى طلبًا</h2><p>الكميات غير الملغاة.</p></div></div></div><div className="top-items pro-top-items">{data.topItems.length?data.topItems.map((x,i)=><div key={x.name}><span>{i+1}</span><b>{x.name}</b><em>{x.quantity}</em></div>):<p className="detail-empty">لا توجد طلبات أصناف بعد.</p>}</div></section>
      </div>

      <footer className="report-foot">تم إنشاء هذا التقرير من بيانات Roomora التشغيلية · التوقيت Asia/Riyadh</footer>
    </>}
  </main>;
}
