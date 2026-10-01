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
      const {zipSync,strToU8}=await import("fflate");
      const esc=(value:unknown)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
      const colName=(index:number)=>{
        let n=index+1,name="";
        while(n>0){const r=(n-1)%26;name=String.fromCharCode(65+r)+name;n=Math.floor((n-1)/26)}
        return name;
      };
      const sheetXml=(rows:Array<Array<string|number>>,widths:number[])=>{
        const rowXml=rows.map((row,rIdx)=>{
          const cells=row.map((value,cIdx)=>{
            const ref=colName(cIdx)+(rIdx+1);
            const style=rIdx===0?1:rIdx===1?2:rIdx===2?3:0;
            if(typeof value==="number")return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
            return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
          }).join("");
          return `<row r="${rIdx+1}">${cells}</row>`;
        }).join("");
        const cols=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("");
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A3:${colName(widths.length-1)}3"/>
</worksheet>`;
      };

      const summaryRows:Array<Array<string|number>>=[
        ["Roomora - تقرير استهلاك المستهلكات"],
        [`الفترة: ${from.replace("T"," ")} إلى ${to.replace("T"," ")}`],
        ["الصنف","إجمالي الكمية","عدد الطلبات","عدد الغرف"],
        ...itemTotals.map(x=>[x.item,x.quantity,x.requests,x.rooms])
      ];
      const detailsRows:Array<Array<string|number>>=[
        ["Roomora - تفاصيل استهلاك المستهلكات"],
        [`الفترة: ${from.replace("T"," ")} إلى ${to.replace("T"," ")}`],
        ["التاريخ والوقت","الغرفة","النزيل","الصنف","الكمية","الحالة"],
        ...detailRows.map(x=>[formatDateTime(x.requestedAt),x.room,x.guest,x.item,x.quantity,statusLabels[x.status]||x.status])
      ];
      const timelineRows:Array<Array<string|number>>=[
        ["Roomora - التجميع الزمني"],
        [`التجميع: ${groupBy==="hour"?"بالساعة":groupBy==="month"?"بالشهر":"باليوم"}`],
        ["الفترة","إجمالي الكمية"],
        ...grouped.map(x=>[x.label,x.quantity])
      ];

      const files:Record<string,Uint8Array>={};
      const add=(path:string,text:string)=>{files[path]=strToU8(text)};

      add("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
      add("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
      add("xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="ملخص المستهلكات" sheetId="1" r:id="rId1"/><sheet name="تفاصيل الطلبات" sheetId="2" r:id="rId2"/><sheet name="التجميع الزمني" sheetId="3" r:id="rId3"/></sheets>
</workbook>`);
      add("xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
      add("xl/styles.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF155F4B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E6B58"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>
</styleSheet>`);
      add("xl/worksheets/sheet1.xml",sheetXml(summaryRows,[28,18,16,14]));
      add("xl/worksheets/sheet2.xml",sheetXml(detailsRows,[24,12,24,26,12,18]));
      add("xl/worksheets/sheet3.xml",sheetXml(timelineRows,[25,18]));

      const zipped=zipSync(files,{level:6});
      saveBlob(new Blob([zipped],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`roomora-consumables-${from.slice(0,10)}-${to.slice(0,10)}.xlsx`);
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
