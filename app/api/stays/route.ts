import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function POST(request: Request) {
  const jar = await cookies();
  const token = jar.get("roomora_session")?.value || "";
  if (!token) return NextResponse.json({ error:"unauthorized" }, { status:401 });

  const body = await request.text();
  const response = await fetch(API_BASE + "/api/stays", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      authorization:"Bearer " + token
    },
    body,
    cache:"no-store"
  });

  const payload = await response.json().catch(()=>({ error:"invalid_response" }));
  return NextResponse.json(payload,{ status:response.status });
}
