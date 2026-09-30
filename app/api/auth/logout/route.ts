import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("roomora_session")?.value;

  if (token) {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    }).catch(() => null);
  }

  jar.delete("roomora_session");
  return NextResponse.json({ ok: true });
}
