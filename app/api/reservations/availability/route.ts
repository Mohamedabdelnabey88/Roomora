import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

async function token() {
  const jar=await cookies();
  return jar.get("roomora_session")?.value || "";
}

export async function GET(request:Request) {
  const t=await token();
  if(!t)return NextResponse.json({error:"unauthorized"},{status:401});
  const url=new URL(request.url);
  const target=new URL(API_BASE+"/api/reservations/availability");
  target.searchParams.set("from",url.searchParams.get("from")||"");
  target.searchParams.set("to",url.searchParams.get("to")||"");
  const response=await fetch(target,{headers:{authorization:"Bearer "+t},cache:"no-store"});
  const payload=await response.json().catch(()=>({error:"invalid_response"}));
  return NextResponse.json(payload,{status:response.status});
}
