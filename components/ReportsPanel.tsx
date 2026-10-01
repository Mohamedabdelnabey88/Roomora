"use client";

import { useEffect,useMemo,useRef,useState } from "react";
import { CalendarBlank,Clock,DownloadSimple,FilePdf,Package,Table,TrendUp } from "@phosphor-icons/react";

type RequestRow={
  id:string;
  room_number:string;
  guest_name:string;
  items:string;
  status:string;
  priority:string;
  requested_at:string;
  business_day?:string;
};

type DetailRow={
  requestId:string;
  requestedAt:string;
  room:string;
  guest:string;
  item:string;
  quantity:number;
  status:string;
};

type Preset="today"|"yesterday"|"month"|"custom";
type GroupBy="hour"|"day"|"month";
type StatusMode="active"|"delivered"|"all";

const statusLabels:Record<string,string>={
  new:"جديد",acknowledged:"تم الاستلام",preparing:"جاري التجهيز",
  approval_required:"بانتظار موافقة",delivered:"تم التسليم",cancelled:"ملغي"
};

function riyadhParts(date:Date){
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  const read=(type:string)=>parts.find(p=>p.type===type)?.value||"00";
  return {year:read("year"),month:read("month"),day:read("day"),hour:read("hour"),minute:read("minute")};
}

function toInput(date:Date){
  const p=riyadhParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function parseRiyadhInput(value:string){
  if(!value)return NaN;
  return Date.parse(value+":00+03:00");
}

function presetRange(preset:Preset){
  const now=new Date();
  const p=riyadhParts(now);
  const today=`${p.year}-${p.month}-${p.day}`;
  if(preset==="today") return {from:today+"T00:00",to:toInput(now)};
  if(preset==="month") return {from:`${p.year}-${p.month}-01T00:00`,to:toInput(now)};
  if(preset==="yesterday"){
    const anchor=new Date(Date.parse(today+"T12:00:00+03:00")-86400000);
    const y=riyadhParts(anchor);
    const d=`${y.year}-${y.month}-${y.day}`;
    return {from:d+"T00:00",to:d+"T23:59"};
  }
  return {from:today+"T00:00",to:toInput(now)};
}

function parseItems(value:string){
  return String(value||"").split("،").map(x=>x.trim()).filter(Boolean).map(part=>{
    const match=part.match(/^(.*?)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*$/);
    if(match)return {item:match[1].trim(),quantity:Number(match[2])||0};
    return {item:part,quantity:1};
  });
}

function formatDateTime(value:string){
  return new Intl.DateTimeFormat("ar-SA",{
    timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

function saveBlob(blob:Blob,name:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function ReportsPanel(){
  const initial=presetRange("today");
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [exporting,setExporting]=useState<"pdf"|"xlsx"|null>(null);
  const [error,setError]=useState("");
  const [preset,setPreset]=useState<Preset>("today");
  const [from,setFrom]=useState(initial.from);
  const [to,setTo]=useState(initial.to);
  const [groupBy,setGroupBy]=useState<GroupBy>("day");
  const [statusMode,setStatusMode]=useState<StatusMode>("active");
  const reportRef=useRef<HTMLDivElement>(null);

  async function load(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/requests?scope=all",{cache:"no-store"});
      if(response.status===401){window.location.href="/login";return}
      const payload=await response.json().catch(()=>[]);
      if(!response.ok||!Array.isArray(payload))throw new Error("تعذر تحميل بيانات المستهلكات");
      setRows(payload);
    }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل التقرير")}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[]);

  function applyPreset(next:Preset){
    setPreset(next);
    if(next!=="custom"){
      const range=presetRange(next);
      setFrom(range.from);setTo(range.to);
    }
  }

  const filteredRequests=useMemo(()=>{
    const start=parseRiyadhInput(from),end=parseRiyadhInput(to);
    return rows.filter(row=>{
      const time=Date.parse(row.requested_at);
      if(!Number.isFinite(time)||time<start||time>end)return false;
      if(statusMode==="delivered")return row.status==="delivered";
      if(statusMode==="active")return row.status!=="cancelled";
      return true;
    });
  },[rows,from,to,statusMode]);

  const detailRows=useMemo<DetailRow[]>(()=>filteredRequests.flatMap(request=>
    parseItems(request.items).map(line=>({
      requestId:request.id,requestedAt:request.requested_at,room:request.room_number,
      guest:request.guest_name,item:line.item,quantity:line.quantity,status:request.status
    }))
  ),[filteredRequests]);

  const itemTotals=useMemo(()=>{
    const map=new Map<string,{item:string;quantity:number;requests:Set<string>;rooms:Set<string>}>();
    for(const row of detailRows){
      const current=map.get(row.item)||{item:row.item,quantity:0,requests:new Set<string>(),rooms:new Set<string>()};
      current.quantity+=row.quantity;current.requests.add(row.requestId);current.rooms.add(row.room);map.set(row.item,current);
    }
    return Array.from(map.values()).map(x=>({item:x.item,quantity:x.quantity,requests:x.requests.size,rooms:x.rooms.size})).sort((a,b)=>b.quantity-a.quantity);
  },[detailRows]);

  const grouped=useMemo(()=>{
    const map=new Map<string,number>();
    for(const row of detailRows){
      const d=new Date(row.requestedAt);
      const p=riyadhParts(d);
      const key=groupBy==="hour"?`${p.year}-${p.month}-${p.day} ${p.hour}:00`:groupBy==="month"?`${p.year}-${p.month}`:`${p.year}-${p.month}-${p.day}`;
      map.set(key,(map.get(key)||0)+row.quantity);
    }
    return Array.from(map.entries()).map(([label,quantity])=>({label,quantity})).sort((a,b)=>a.label.localeCompare(b.label));
  },[detailRows,groupBy]);

  const totalQty=detailRows.reduce((sum,row)=>sum+row.quantity,0);
  const top=itemTotals[0];

  async function exportXlsx(){
    if(!itemTotals.length){setError("لا توجد بيانات لتصديرها ضمن الفترة المحددة.");return}
    setExporting("xlsx");setError("");
    try{
      const {Workbook}=await import("exceljs");
      const wb=new Workbook();
      wb.creator="Roomora";wb.created=new Date();
      const summary=wb.addWorksheet("ملخص المستهلكات",{views:[{rightToLeft:true}]});
      summary.columns=[
        {header:"الصنف",key:"item",width:28},{header:"إجمالي الكمية",key:"quantity",width:18},
        {header:"عدد الطلبات",key:"requests",width:16},{header:"عدد الغرف",key:"rooms",width:14}
      ];
      itemTotals.forEach(x=>summary.addRow(x));
      summary.spliceRows(1,0,["Roomora - تقرير استهلاك المستهلكات"]);
      summary.spliceRows(2,0,[`الفترة: ${from.replace("T"," ")} إلى ${to.replace("T"," ")}`]);
      summary.mergeCells("A1:D1");summary.mergeCells("A2:D2");
      summary.getCell("A1").font={bold:true,size:18,color:{argb:"FFFFFFFF"}};
      summary.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF155F4B"}};
      summary.getCell("A1").alignment={horizontal:"center"};
      summary.getCell("A2").font={bold:true,color:{argb:"FF355B4E"}};summary.getCell("A2").alignment={horizontal:"center"};
      const header=summary.getRow(3);
      header.font={bold:true,color:{argb:"FFFFFFFF"}};
      header.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF2E6B58"}};
      header.alignment={horizontal:"center"};
      summary.eachRow((row,index)=>{if(index>3){row.height=22;row.eachCell(cell=>{cell.alignment={horizontal:"center",vertical:"middle"};cell.border={bottom:{style:"hair",color:{argb:"FFDDE7E2"}}};});}});
      summary.autoFilter={from:"A3",to:"D3"};
      summary.freezePanes={ySplit:3} as never;

      const details=wb.addWorksheet("تفاصيل الطلبات",{views:[{rightToLeft:true}]});
      details.columns=[
        {header:"التاريخ والوقت",key:"time",width:24},{header:"الغرفة",key:"room",width:12},
        {header:"النزيل",key:"guest",width:24},{header:"الصنف",key:"item",width:26},
        {header:"الكمية",key:"quantity",width:12},{header:"الحالة",key:"status",width:18}
      ];
      detailRows.forEach(x=>details.addRow({time:formatDateTime(x.requestedAt),room:x.room,guest:x.guest,item:x.item,quantity:x.quantity,status:statusLabels[x.status]||x.status}));
      details.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
      details.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF155F4B"}};
      details.getRow(1).alignment={horizontal:"center"};
      details.autoFilter={from:"A1",to:"F1"};
      details.views=[{rightToLeft:true,state:"frozen",ySplit:1}];

      const timeline=wb.addWorksheet("التجميع الزمني",{views:[{rightToLeft:true}]});
      timeline.columns=[{header:"الفترة",key:"label",width:25},{header:"إجمالي الكمية",key:"quantity",width:18}];
      grouped.forEach(x=>timeline.addRow(x));
      timeline.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
      timeline.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFC89A52"}};

      const buffer=await wb.xlsx.writeBuffer();
      saveBlob(new Blob([new Uint8Array(buffer)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`roomora-consumables-${from.slice(0,10)}-${to.slice(0,10)}.xlsx`);
    }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء ملف Excel")}
    finally{setExporting(null)}
  }

  async function exportPdf(){
    const node=reportRef.current;
    if(!node||!itemTotals.length){setError("لا توجد بيانات لتصديرها ضمن الفترة المحددة.");return}
    setExporting("pdf");setError("");
    try{
      const [{default:html2canvas},{jsPDF}]=await Promise.all([import("html2canvas"),import("jspdf")]);
      const canvas=await html2canvas(node,{scale:2.2,useCORS:true,backgroundColor:"#ffffff",logging:false,windowWidth:node.scrollWidth,windowHeight:node.scrollHeight});
      const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
      const pageW=210,pageH=297,margin=10,usableW=pageW-margin*2,usableH=pageH-margin*2;
      const pxPerMm=canvas.width/usableW;
      const pageSlicePx=Math.floor(usableH*pxPerMm);
      let offset=0,page=0;
      while(offset<canvas.height){
        const sliceH=Math.min(pageSlicePx,canvas.height-offset);
        const part=document.createElement("canvas");
        part.width=canvas.width;part.height=sliceH;
        const ctx=part.getContext("2d");
        if(!ctx)throw new Error("تعذر تجهيز صفحة PDF");
        ctx.fillStyle="#ffffff";ctx.fillRect(0,0,part.width,part.height);
        ctx.drawImage(canvas,0,offset,canvas.width,sliceH,0,0,canvas.width,sliceH);
        if(page>0)pdf.addPage();
        const hMm=sliceH/pxPerMm;
        pdf.addImage(part.toDataURL("image/jpeg",0.94),"JPEG",margin,margin,usableW,hMm,undefined,"FAST");
        offset+=sliceH;page++;
      }
      pdf.save(`roomora-consumables-${from.slice(0,10)}-${to.slice(0,10)}.pdf`);
    }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء ملف PDF")}
    finally{setExporting(null)}
  }

  return <main className="settings-page consumables-report-page">
    <header className="settings-header premium-page-head">
      <div><span className="section-kicker">CONSUMPTION ANALYTICS</span><h1>تقرير استهلاك المستهلكات</h1><p>كمية كل صنف تم طلبها خلال فترة زمنية محددة، مع تحليل حسب الساعة أو اليوم أو الشهر.</p></div>
      <div className="report-actions">
        <button className="secondary-btn" disabled={Boolean(exporting)||!itemTotals.length} onClick={()=>void exportXlsx()}><Table size={18}/>{exporting==="xlsx"?"جاري إنشاء Excel…":"تنزيل Excel XLSX"}</button>
        <button className="primary-btn" disabled={Boolean(exporting)||!itemTotals.length} onClick={()=>void exportPdf()}><FilePdf size={18}/>{exporting==="pdf"?"جاري إنشاء PDF…":"تنزيل PDF"}</button>
      </div>
    </header>

    <section className="panel consumption-filters">
      <div className="preset-tabs">
        {([["today","اليوم"],["yesterday","أمس"],["month","هذا الشهر"],["custom","مخصص"]] as Array<[Preset,string]>).map(([key,label])=><button key={key} className={preset===key?"active":""} onClick={()=>applyPreset(key)}>{label}</button>)}
      </div>
      <div className="date-filter-grid">
        <label><span>من التاريخ والساعة</span><div><CalendarBlank size={17}/><input type="datetime-local" value={from} onChange={e=>{setPreset("custom");setFrom(e.target.value)}}/></div></label>
        <label><span>إلى التاريخ والساعة</span><div><Clock size={17}/><input type="datetime-local" value={to} onChange={e=>{setPreset("custom");setTo(e.target.value)}}/></div></label>
        <label><span>تجميع زمني</span><select value={groupBy} onChange={e=>setGroupBy(e.target.value as GroupBy)}><option value="hour">حسب الساعة</option><option value="day">حسب اليوم</option><option value="month">حسب الشهر</option></select></label>
        <label><span>حالة الطلب</span><select value={statusMode} onChange={e=>setStatusMode(e.target.value as StatusMode)}><option value="active">كل الطلبات غير الملغاة</option><option value="delivered">تم التسليم فقط</option><option value="all">كل الطلبات بما فيها الملغاة</option></select></label>
      </div>
    </section>

    {error?<div className="login-error page-error">{error}</div>:null}
    {loading?<div className="rooms-state">جاري تحليل استهلاك المستهلكات…</div>:
    <div ref={reportRef} className="consumption-export-document">
      <section className="consumption-doc-head">
        <div><b>Roomora</b><span>Consumables Consumption Report</span></div>
        <div><span>الفترة</span><b>{from.replace("T"," ")} ← {to.replace("T"," ")}</b><small>Asia/Riyadh</small></div>
      </section>

      <section className="consumption-kpis">
        <article><Package size={22}/><div><span>إجمالي الكميات</span><b>{totalQty}</b><small>وحدة مستهلكة / مطلوبة</small></div></article>
        <article><TrendUp size={22}/><div><span>أعلى صنف</span><b>{top?.item||"—"}</b><small>{top?top.quantity+" وحدة":"لا توجد بيانات"}</small></div></article>
        <article><DownloadSimple size={22}/><div><span>عدد الطلبات</span><b>{filteredRequests.length}</b><small>طلب ضمن الفترة</small></div></article>
        <article><Table size={22}/><div><span>عدد الأصناف</span><b>{itemTotals.length}</b><small>صنف مختلف</small></div></article>
      </section>

      <section className="panel consumption-table-card">
        <div className="report-section-title"><div><Package size={20}/><div><h2>إجمالي الاستهلاك حسب الصنف</h2><p>البيانات الأساسية المطلوبة للمخزون والمتابعة اليومية.</p></div></div></div>
        {itemTotals.length?<div className="consumption-table-wrap"><table className="consumption-table"><thead><tr><th>#</th><th>الصنف</th><th>إجمالي الكمية</th><th>عدد الطلبات</th><th>عدد الغرف</th><th>النسبة من الاستهلاك</th></tr></thead><tbody>{itemTotals.map((x,i)=><tr key={x.item}><td>{i+1}</td><td><b>{x.item}</b></td><td><strong>{x.quantity}</strong></td><td>{x.requests}</td><td>{x.rooms}</td><td><div className="usage-bar"><span style={{width:(totalQty?Math.round(x.quantity/totalQty*100):0)+"%"}}/></div><small>{totalQty?Math.round(x.quantity/totalQty*100):0}%</small></td></tr>)}</tbody></table></div>:<div className="empty-pro-state"><Package size={28}/><b>لا يوجد استهلاك في هذه الفترة</b><span>غيّر الفترة الزمنية أو حالة الطلب.</span></div>}
      </section>

      <div className="consumption-report-grid">
        <section className="panel consumption-table-card">
          <div className="report-section-title"><div><Clock size={20}/><div><h2>التوزيع الزمني</h2><p>{groupBy==="hour"?"حسب الساعة":groupBy==="month"?"حسب الشهر":"حسب اليوم"}</p></div></div></div>
          <div className="timeline-consumption">{grouped.map(x=><div key={x.label}><span>{x.label}</span><div><i style={{width:(totalQty?Math.max(4,x.quantity/totalQty*100):0)+"%"}}/></div><b>{x.quantity}</b></div>)}</div>
        </section>

        <section className="panel consumption-table-card">
          <div className="report-section-title"><div><Table size={20}/><div><h2>تفاصيل الاستخدام</h2><p>آخر تفاصيل الطلبات ضمن الفترة.</p></div></div></div>
          <div className="detail-usage-list">{detailRows.slice(0,30).map((x,i)=><div key={x.requestId+x.item+i}><div><b>{x.item}</b><span>غرفة {x.room} · {x.guest}</span></div><div><strong>{x.quantity}</strong><small>{formatDateTime(x.requestedAt)}</small></div></div>)}</div>
        </section>
      </div>

      <footer className="report-foot">Roomora · تقرير استهلاك المستهلكات · تم توليده من طلبات الغرف المسجلة في النظام</footer>
    </div>}
  </main>;
}
