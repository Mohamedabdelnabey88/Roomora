import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const session = jar.get("roomora_session")?.value || "";
  if (!session) return NextResponse.json({ error:"unauthorized" }, { status:401 });
  const { id } = await context.params;
  const body = await request.text();
  const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(id)}`, {
    method:"PATCH",
    headers:{ "content-type":"application/json", authorization:`Bearer ${session}` },
    body,
    cache:"no-store"
  });
  return NextResponse.json(await response.json(), { status:response.status });
}
