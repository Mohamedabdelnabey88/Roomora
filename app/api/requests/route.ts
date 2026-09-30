import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

async function session() {
  const jar = await cookies();
  return jar.get("roomora_session")?.value || "";
}

export async function GET() {
  const token = await session();
  if (!token) return NextResponse.json({error:"unauthorized"},{status:401});
  const response = await fetch(API_BASE + "/api/requests", {
    headers:{authorization:"Bearer " + token},
    cache:"no-store"
  });
  return NextResponse.json(await response.json(),{status:response.status});
}

export async function POST(request:Request) {
  const token = await session();
  if (!token) return NextResponse.json({error:"unauthorized"},{status:401});
  const response = await fetch(API_BASE + "/api/requests", {
    method:"POST",
    headers:{"content-type":"application/json",authorization:"Bearer " + token},
    body:await request.text(),
    cache:"no-store"
  });
  return NextResponse.json(await response.json(),{status:response.status});
}
