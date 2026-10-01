import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE=process.env.ROOMORA_API_BASE_URL||"https://roomora.mohamed27abdelnaby.workers.dev";

export async function GET(){
  const jar=await cookies();
  const token=jar.get("roomora_session")?.value||"";
  if(!token)return NextResponse.json({error:"unauthorized"},{status:401});

  const headers={authorization:"Bearer "+token};
  const [summaryResponse,staysResponse]=await Promise.all([
    fetch(API_BASE+"/api/reports/summary",{headers,cache:"no-store"}),
    fetch(API_BASE+"/api/stays",{headers,cache:"no-store"})
  ]);
  const summary=await summaryResponse.json().catch(()=>null);
  const stays=await staysResponse.json().catch(()=>[]);

  if(!summaryResponse.ok||!summary)return NextResponse.json(summary||{error:"reports_unavailable"},{status:summaryResponse.status||502});

  if(staysResponse.ok&&Array.isArray(stays)&&typeof summary.businessDay==="string"){
    // Asia/Riyadh is UTC+3 year-round. Hotel day 06:00 KSA => 03:00 UTC.
    const startMs=Date.parse(summary.businessDay+"T03:00:00.000Z");
    const endMs=startMs+24*60*60*1000;
    const within=(value?:string|null)=>{
      if(!value)return false;
      const ms=Date.parse(value);
      return Number.isFinite(ms)&&ms>=startMs&&ms<endMs;
    };
    const inHouse=stays.filter((s:{status:string})=>s.status==="in_house").length;
    summary.stayStats={...summary.stayStats,in_house:inHouse,checkins_today:stays.filter((s:{checkin_at:string})=>within(s.checkin_at)).length,checkouts_today:stays.filter((s:{actual_checkout_at?:string|null})=>within(s.actual_checkout_at)).length};
    summary.roomStats={...summary.roomStats,occupied_rooms:inHouse};
  }

  return NextResponse.json(summary);
}
