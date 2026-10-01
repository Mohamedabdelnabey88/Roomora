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

  function escapeHtml(value:unknown){
    return String(value??"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function printPdf(){
    if(!data)return;
    const printWindow=window.open("","_blank","noopener,noreferrer,width=1000,height=800");
    if(!printWindow){
      setError("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة لـ Roomora ثم حاول مرة أخرى.");
      return;
    }

    const generated=generatedAt
      ? generatedAt.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})
      : new Date().toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"});

    const topItemsHtml=data.topItems.length
      ? data.topItems.map((x,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.quantity)}</td></tr>`).join("")
      : '<tr><td colspan="3">لا توجد أصناف مطلوبة بعد.</td></tr>';

    const avg=data.requestStats.avg_delivery_minutes==null
      ? "—"
      : Math.round(data.requestStats.avg_delivery_minutes)+" دقيقة";

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>Roomora Report - ${escapeHtml(data.businessDay)}</title>
<style>
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box}
  body{font-family:Arial,Tahoma,sans-serif;color:#14231e;background:#fff;margin:0}
  .doc{width:100%;max-width:180mm;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #184f40;padding-bottom:12px;margin-bottom:18px}
  .brand{font-size:24px;font-weight:800;color:#184f40}.sub{font-size:11px;color:#728079;margin-top:3px}
  .meta{text-align:left;font-size:11px;color:#6f7d77}.meta b{display:block;color:#14231e;font-size:13px;margin-top:3px}
  h1{font-size:22px;margin:0 0 5px}.lead{font-size:11px;color:#6f7d77;margin:0}
  .title{margin-bottom:18px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:16px}
  .card{border:1px solid #dfe7e3;border-radius:12px;padding:12px;background:#fafcfa;break-inside:avoid}
  .card span{display:block;font-size:9px;color:#7a8983}.card b{display:block;font-size:22px;margin-top:5px;color:#10211c}
  .section{border:1px solid #dfe7e3;border-radius:14px;padding:14px;margin-bottom:14px;break-inside:avoid}
  .section h2{font-size:14px;margin:0 0 10px;color:#184f40}
  .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .metric{background:#f7faf8;border:1px solid #e7ecea;border-radius:9px;padding:9px}
  .metric span{display:block;font-size:8px;color:#7d8a85}.metric b{display:block;font-size:15px;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th,td{padding:8px;border-bottom:1px solid #e7ecea;text-align:right}
  th{background:#f4f8f6;color:#3b5d51}
  .footer{text-align:center;color:#8a9691;font-size:8px;margin-top:18px}
</style>
</head>
<body>
  <div class="doc">
    <div class="head">
      <div><div class="brand">Roomora</div><div class="sub">Hotel Operations Report</div></div>
      <div class="meta">يوم الفندق<b>${escapeHtml(data.businessDay)}</b><span>تم الإنشاء: ${escapeHtml(generated)}</span></div>
    </div>

    <div class="title">
      <h1>التقرير التشغيلي</h1>
      <p class="lead">ملخص الإشغال والإقامات وطلبات الخدمة الفعلية.</p>
    </div>

    <div class="grid">
      <div class="card"><span>الإشغال الحالي</span><b>${data.stayStats.in_house} / ${data.roomStats.total_rooms}</b></div>
      <div class="card"><span>دخول اليوم</span><b>${data.stayStats.checkins_today}</b></div>
      <div class="card"><span>خروج اليوم</span><b>${data.stayStats.checkouts_today}</b></div>
      <div class="card"><span>طلبات اليوم</span><b>${data.requestStats.requests_today}</b></div>
    </div>

    <div class="section">
      <h2>الإشغال والغرف</h2>
      <div class="metrics">
        <div class="metric"><span>إجمالي الغرف</span><b>${data.roomStats.total_rooms}</b></div>
        <div class="metric"><span>الغرف المتاحة</span><b>${data.roomStats.available_rooms}</b></div>
        <div class="metric"><span>داخل الفندق</span><b>${data.stayStats.in_house}</b></div>
        <div class="metric"><span>إجمالي المغادرات</span><b>${data.stayStats.checked_out_total}</b></div>
      </div>
    </div>

    <div class="section">
      <h2>أداء الخدمة</h2>
      <div class="metrics">
        <div class="metric"><span>طلبات نشطة</span><b>${data.requestStats.active_requests}</b></div>
        <div class="metric"><span>بانتظار موافقة</span><b>${data.requestStats.awaiting_approval}</b></div>
        <div class="metric"><span>إجمالي الطلبات</span><b>${data.requestStats.total_requests}</b></div>
        <div class="metric"><span>متوسط التسليم</span><b>${escapeHtml(avg)}</b></div>
      </div>
    </div>

    <div class="section">
      <h2>الأصناف الأعلى طلبًا</h2>
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th></tr></thead>
        <tbody>${topItemsHtml}</tbody>
      </table>
    </div>

    <div class="footer">تم إنشاء هذا التقرير من بيانات Roomora التشغيلية · Asia/Riyadh</div>
  </div>
<script>
  window.addEventListener("load",()=>setTimeout(()=>window.print(),250));
</script>
</body>
</html>`);
    printWindow.document.close();
  }

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
    <header className="settings-header premium-page-head report-page-head"><div><span className="section-kicker">OPERATIONS INTELLIGENCE</span><h1>التقرير التشغيلي</h1><p>ملخص يوم الفندق من بيانات الإقامات وطلبات الخدمة الفعلية.</p></div><div className="report-actions"><button className="secondary-btn" onClick={downloadCsv}>تنزيل Excel / CSV</button><button className="primary-btn print-report-btn" onClick={printPdf}><FilePdf size={18}/> حفظ PDF / طباعة</button></div></header>

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
