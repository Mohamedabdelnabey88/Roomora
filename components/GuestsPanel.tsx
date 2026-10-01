"use client";
import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight,MagnifyingGlass,Phone,Eye,Trash,WarningCircle,FilePdf,CalendarCheck } from "@phosphor-icons/react";
import StayDetailDialog from "@/components/StayDetailDialog";

type StayRow={
  id:string; guest_name:string; guest_phone?:string|null; status:string;
  checkin_at:string; expected_checkout_at:string; actual_checkout_at?:string|null;
  room_number:string; room_type:string; total_requests:number; open_requests:number;
};

export default function GuestsPanel(){
  const searchParams=useSearchParams();
  const checkoutView=searchParams.get("view")==="checkout-today";
  const checkoutHistoryView=searchParams.get("view")==="checkout-history";
  const checkoutSection=checkoutView||checkoutHistoryView;
  const [rows,setRows]=useState<StayRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [q,setQ]=useState("");
  const [scope,setScope]=useState("all");
  const [role,setRole]=useState<"admin"|"reception"|null>(null);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [deleteError,setDeleteError]=useState("");
  const [exportingCheckoutPdf,setExportingCheckoutPdf]=useState(false);
  const [exportError,setExportError]=useState("");

  async function load(silent=false){
    if(!silent)setLoading(true);
    const [r,u]=await Promise.all([fetch("/api/stays",{cache:"no-store"}),fetch("/api/auth/me",{cache:"no-store"})]);
    if(r.status===401||u.status===401){window.location.href="/login";return;}
    const p=await r.json().catch(()=>[]);
    const up=await u.json().catch(()=>null);
    if(!r.ok||!Array.isArray(p)){setError("تعذر تحميل سجل النزلاء");if(!silent)setLoading(false);return;}
    setRows(p);setRole(up?.user?.role||null);setError("");if(!silent)setLoading(false);
  }

  useEffect(()=>{
    void load();
    const refresh=()=>{void load(true)};
    const timer=window.setInterval(refresh,30000);
    const onVisibility=()=>{if(document.visibilityState==="visible")refresh()};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",onVisibility)};
  },[]);

  async function deleteStay(id:string){
    if(role!=="admin"||deletingId)return;
    setDeletingId(id);setDeleteError("");
    try{
      const response=await fetch("/api/stays/"+encodeURIComponent(id),{method:"DELETE"});
      const payload=await response.json().catch(()=>({}));
      const map:Record<string,string>={
        forbidden:"الحذف النهائي متاح لمدير النظام فقط.",
        stay_not_found:"ملف النزيل لم يعد موجودًا.",
        backend_unreachable:"تعذر الاتصال بخدمة Roomora الخلفية."
      };
      if(!response.ok)throw new Error(map[payload.error]||"تعذر حذف النزيل والإقامة.");
      setDeleteId(null);
      if(detailId===id)setDetailId(null);
      setRows(old=>old.filter(row=>row.id!==id));
      await load(true);
    }catch(e){
      setDeleteError(e instanceof Error?e.message:"تعذر حذف النزيل والإقامة.");
    }finally{
      setDeletingId(null);
    }
  }

  function riyadhDateKey(value:string|Date){
    const date=typeof value==="string"?new Date(value):value;
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const read=(type:string)=>parts.find(p=>p.type===type)?.value||"";
    return read("year")+"-"+read("month")+"-"+read("day");
  }

  function todayCheckoutRows(){
    const today=riyadhDateKey(new Date());
    return rows
      .filter(x=>x.status!=="cancelled"&&Boolean(x.expected_checkout_at)&&riyadhDateKey(x.expected_checkout_at)===today)
      .sort((a,b)=>String(a.room_number).localeCompare(String(b.room_number),undefined,{numeric:true}));
  }

  function checkoutHistoryRows(){
    return rows
      .filter(x=>x.status==="checked_out"&&Boolean(x.actual_checkout_at))
      .sort((a,b)=>new Date(b.actual_checkout_at||0).getTime()-new Date(a.actual_checkout_at||0).getTime());
  }

  async function exportCheckoutPdf(){
    const checkoutRows=todayCheckoutRows();
    if(!checkoutRows.length){
      setExportError("لا توجد حجوزات موعد خروجها اليوم.");
      return;
    }
    setExportingCheckoutPdf(true);setExportError("");
    const hosts:HTMLDivElement[]=[];
    try{
      const [{default:html2canvas},{PDFDocument}]=await Promise.all([import("html2canvas"),import("pdf-lib")]);
      const todayKey=riyadhDateKey(new Date());
      const todayLabel=new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",year:"numeric",month:"long",day:"numeric"}).format(new Date());
      const generated=new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date());
      const pdf=await PDFDocument.create();
      const pageW=841.89,pageH=595.28,margin=20;
      const usableW=pageW-margin*2,usableH=pageH-margin*2;
      const esc=(value:unknown)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
      const pages:Array<typeof checkoutRows>=[];
      for(let i=0;i<checkoutRows.length;i+=15)pages.push(checkoutRows.slice(i,i+15));

      for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
        const pageRows=pages[pageIndex];
        const startIndex=pageIndex*15;
        const body=pageRows.map((row,index)=>`
          <tr>
            <td class="idx">${startIndex+index+1}</td>
            <td class="room">${esc(row.room_number)}</td>
            <td class="guest">${esc(row.guest_name)}</td>
            <td class="phone">${esc(row.guest_phone||"غير مسجل")}</td>
            <td class="decision"><span class="check-box"></span></td>
            <td class="decision"><span class="check-box"></span></td>
          </tr>
        `).join("");

        const host=document.createElement("div");
        hosts.push(host);
        host.setAttribute("dir","rtl");
        host.style.cssText="position:fixed;left:-20000px;top:0;width:1120px;height:760px;overflow:hidden;background:#fff;color:#17201d;font-family:Tahoma,Arial,sans-serif;padding:24px 28px;";
        host.innerHTML=`
          <style>
            *{box-sizing:border-box}
            .sheet{width:100%;height:100%;display:flex;flex-direction:column}
            .head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #155f4b;padding-bottom:9px;margin-bottom:9px}
            .brand b{display:block;font-size:24px;color:#155f4b;line-height:1}.brand span{display:block;font-size:10px;color:#75837d;margin-top:3px}
            .meta{text-align:left}.meta span{display:block;font-size:9px;color:#788680}.meta b{display:block;font-size:12px;margin:2px 0}
            .title-row{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:8px}
            h1{font-size:20px;margin:0}.subtitle{font-size:9px;color:#6f7e78;margin:2px 0 0}
            .page-no{font-size:9px;color:#7c8984;white-space:nowrap}
            .summary{display:flex;gap:8px;margin-bottom:8px}.summary div{border:1px solid #dfe8e4;background:#f7faf8;border-radius:8px;padding:6px 10px;font-size:9px}.summary b{font-size:13px;color:#155f4b;margin-right:4px}
            table{width:100%;border-collapse:collapse;table-layout:fixed}
            thead{display:table-header-group}
            th{background:#155f4b;color:#fff;height:31px;padding:6px 8px;font-size:11px;border:1px solid #155f4b;text-align:center}
            td{height:34px;padding:5px 8px;border:1px solid #cfdad5;font-size:11px;vertical-align:middle;background:#fff;line-height:1.2}
            tr:nth-child(even) td{background:#fbfcfc}
            th:nth-child(1),td:nth-child(1){width:5%}
            th:nth-child(2),td:nth-child(2){width:12%}
            th:nth-child(3),td:nth-child(3){width:29%}
            th:nth-child(4),td:nth-child(4){width:22%}
            th:nth-child(5),td:nth-child(5){width:16%}
            th:nth-child(6),td:nth-child(6){width:16%}
            .idx,.room,.phone,.decision{text-align:center}.room{font-weight:800;font-size:12px}.guest{font-weight:700}
            .decision{background:#fff!important}.check-box{display:inline-block;width:18px;height:18px;border:2px solid #7f8f88;border-radius:4px;background:#fff}
            .foot{display:flex;justify-content:space-between;margin-top:auto;padding-top:7px;border-top:1px solid #e1e8e5;color:#89958f;font-size:8px}
          </style>
          <div class="sheet">
            <div class="head">
              <div class="brand"><b>Roomora</b><span>Hotel Operations</span></div>
              <div class="meta"><span>تاريخ كشف الخروج</span><b>${esc(todayLabel)}</b><span>تم إنشاء الكشف: ${esc(generated)}</span></div>
            </div>
            <div class="title-row">
              <div><h1>كشف خروج النزلاء</h1><p class="subtitle">الحجوزات المقرر خروجها اليوم — الاسم ورقم الهاتف كما تم تسجيلهما.</p></div>
              <div class="page-no">صفحة ${pageIndex+1} من ${pages.length}</div>
            </div>
            <div class="summary"><div>إجمالي المغادرين المتوقعين اليوم <b>${checkoutRows.length}</b></div><div>المعروض في هذه الصفحة <b>${pageRows.length}</b></div></div>
            <table>
              <thead><tr><th>#</th><th>رقم الغرفة</th><th>اسم العميل</th><th>رقم الهاتف</th><th>خروج</th><th>تمديد</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
            <div class="foot"><span>Roomora · كشف خروج يومي</span><span>بحد أقصى 15 نزيل في الصفحة · ضع علامة ✓ أمام خروج أو تمديد</span></div>
          </div>`;
        document.body.appendChild(host);

        const canvas=await html2canvas(host,{scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false,width:1120,height:760,windowWidth:1120,windowHeight:760});
        const dataUrl=canvas.toDataURL("image/jpeg",0.95);
        const raw=atob(dataUrl.split(",")[1]||"");
        const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        const image=await pdf.embedJpg(bytes);
        const ratio=Math.min(usableW/canvas.width,usableH/canvas.height);
        const drawW=canvas.width*ratio;
        const drawH=canvas.height*ratio;
        const page=pdf.addPage([pageW,pageH]);
        page.drawImage(image,{x:(pageW-drawW)/2,y:(pageH-drawH)/2,width:drawW,height:drawH});
      }

      const output=await pdf.save({useObjectStreams:true});
      const buffer=output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength) as ArrayBuffer;
      const blob=new Blob([buffer],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=`roomora-checkouts-${todayKey}.pdf`;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){
      setExportError(e instanceof Error?e.message:"تعذر إنشاء كشف الخروج PDF.");
    }finally{
      for(const host of hosts)if(host.parentNode)host.parentNode.removeChild(host);
      setExportingCheckoutPdf(false);
    }
  }

  const todayCheckoutCount=useMemo(()=>todayCheckoutRows().length,[rows]);
  const checkoutHistoryCount=useMemo(()=>checkoutHistoryRows().length,[rows]);

  const filtered=useMemo(()=>{
    const source=checkoutView?todayCheckoutRows():checkoutHistoryView?checkoutHistoryRows():rows;
    return source.filter(x=>{
      const text=(x.guest_name+" "+(x.guest_phone||"")+" "+x.room_number).toLowerCase();
      return (checkoutSection||scope==="all"||x.status===scope)&&(!q||text.includes(q.toLowerCase()));
    });
  },[rows,q,scope,checkoutView,checkoutHistoryView,checkoutSection]);

  function d(v?:string|null){if(!v)return "—";return new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v));}
  function phone(v?:string|null){if(!v)return "غير مسجل";const s=v.replace(/\s+/g,"");return s.length>5?s.slice(0,2)+"•••••"+s.slice(-3):"••••";}

  return <main className="settings-page">
    <header className="settings-header premium-page-head"><div><Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link><span className="section-kicker">GUEST DIRECTORY</span><h1>النزلاء والإقامات</h1><p>السجل الحالي والتاريخي للنزلاء المرتبط بالإقامات والغرف.</p></div><button className="primary-btn checkout-pdf-btn" onClick={()=>void exportCheckoutPdf()} disabled={exportingCheckoutPdf}><FilePdf size={18}/>{exportingCheckoutPdf?"جاري إنشاء الكشف…":"كشف خروج اليوم PDF"}</button></header>
    {exportError?<div className="login-error page-error">{exportError}</div>:null}
    {checkoutSection?<section className="checkout-today-banner checkout-workspace-banner">
      <div className="checkout-today-copy"><CalendarCheck size={24}/><div><span className="section-kicker">{checkoutView?"TODAY CHECKOUT":"CHECKOUT HISTORY"}</span><h2>{checkoutView?"خروج اليوم":"سجل الخروج"}</h2><p>{checkoutView?<>الحجوزات المقرر خروجها حسب تاريخ الرياض الحالي: <b>{todayCheckoutCount}</b></>:<>إجمالي حالات الخروج المسجلة: <b>{checkoutHistoryCount}</b></>}</p></div></div>
      <div className="checkout-workspace-actions">
        <div className="checkout-view-tabs">
          <Link href="/guests?view=checkout-today" className={checkoutView?"active":""}>خروج اليوم</Link>
          <Link href="/guests?view=checkout-history" className={checkoutHistoryView?"active":""}>سجل الخروج</Link>
        </div>
        {checkoutView?<button className="primary-btn checkout-pdf-btn prominent" onClick={()=>void exportCheckoutPdf()} disabled={exportingCheckoutPdf||todayCheckoutCount===0}><FilePdf size={18}/>{exportingCheckoutPdf?"جاري إنشاء الكشف…":"تنزيل كشف خروج اليوم PDF"}</button>:null}
      </div>
    </section>:null}
    <section className="panel rooms-directory">
      <div className="directory-toolbar"><div className="search wide"><MagnifyingGlass size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث باسم النزيل أو الجوال أو الغرفة"/></div><select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">كل الإقامات</option><option value="in_house">داخل الفندق</option><option value="checked_out">غادر</option><option value="cancelled">ملغاة</option></select></div>
      {loading?<div className="rooms-state">جاري تحميل النزلاء…</div>:error?<div className="rooms-state error">{error}</div>:
      <div className="rooms-table-wrap"><table className="rooms-table"><thead><tr><th>النزيل</th><th>الغرفة</th><th>الحالة</th><th>الدخول</th><th>الخروج المتوقع</th><th>الخروج الفعلي</th><th>الطلبات</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td><b>{x.guest_name}</b><small><Phone size={11}/> {checkoutSection?(x.guest_phone||"غير مسجل"):phone(x.guest_phone)}</small></td><td><b>{x.room_number}</b><small>{x.room_type}</small></td><td><span className={"table-status "+(x.status==="in_house"?"occupied":"available")}>{x.status==="in_house"?"داخل الفندق":x.status==="checked_out"?"غادر":"ملغاة"}</span></td><td>{d(x.checkin_at)}</td><td>{d(x.expected_checkout_at)}</td><td>{d(x.actual_checkout_at)}</td><td>{x.total_requests||0}{Number(x.open_requests||0)>0?<small>{x.open_requests} مفتوح</small>:null}</td><td>{role?<div className="guest-row-actions">
  <button className="detail-button compact" onClick={()=>setDetailId(x.id)}><Eye size={14}/> فتح الملف</button>
  {role==="admin"?(deleteId!==x.id
    ?<button className="guest-delete-btn" onClick={()=>{setDeleteError("");setDeleteId(x.id)}}><Trash size={13}/> حذف</button>
    :<div className="guest-delete-confirm"><span><WarningCircle size={13}/> حذف النزيل والحجز وكل طلباته؟</span><div><button onClick={()=>setDeleteId(null)} disabled={deletingId===x.id}>تراجع</button><button className="danger" onClick={()=>void deleteStay(x.id)} disabled={deletingId===x.id}>{deletingId===x.id?"جاري الحذف…":"تأكيد الحذف"}</button></div>{deleteError?<small>{deleteError}</small>:null}</div>):null}
</div>:<span>—</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <StayDetailDialog stayId={detailId} role={role} onClose={()=>setDetailId(null)} onDeleted={async()=>{setDetailId(null);await load(true)}}/>
  </main>;
}
