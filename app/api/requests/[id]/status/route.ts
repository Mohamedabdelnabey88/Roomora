import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function PATCH(request:Request, context:{params:Promise<{id:string}>}) {
  const jar = await cookies();
  const token = jar.get("roomora_session")?.value || "";
  if (!token) return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await context.params;
  try {
    const response=await fetch(API_BASE + "/api/requests/" + encodeURIComponent(id) + "/status",{
      method:"PATCH",
      headers:{"content-type":"application/json",authorization:"Bearer "+token},
      body:await request.text(),
      cache:"no-store"
    });
    const payload=await response.json().catch(()=>({error:"invalid_response"}));
    return NextResponse.json(payload,{status:response.status});
  } catch (error) {
    console.error("request_status_proxy_failed", error);
    return NextResponse.json({error:"backend_unreachable"},{status:502});
  }
}
