import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

async function token() {
  const jar = await cookies();
  return jar.get("roomora_session")?.value || "";
}

export async function GET() {
  const session = await token();
  if (!session) return NextResponse.json({ error:"unauthorized" }, { status:401 });
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    headers:{ authorization:`Bearer ${session}` },
    cache:"no-store"
  });
  return NextResponse.json(await response.json(), { status:response.status });
}

export async function POST(request: Request) {
  const session = await token();
  if (!session) return NextResponse.json({ error:"unauthorized" }, { status:401 });
  const body = await request.text();
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method:"POST",
    headers:{ "content-type":"application/json", authorization:`Bearer ${session}` },
    body,
    cache:"no-store"
  });
  return NextResponse.json(await response.json(), { status:response.status });
}
