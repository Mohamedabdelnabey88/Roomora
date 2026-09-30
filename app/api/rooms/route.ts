import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function GET() {
  const jar = await cookies();
  const token = jar.get("roomora_session")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const response = await fetch(`${API_BASE}/api/rooms`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
