import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const payload = await response.json();
  if (!response.ok) return NextResponse.json(payload, { status: response.status });

  const jar = await cookies();
  jar.set("roomora_session", payload.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return NextResponse.json({ user: payload.user });
}
