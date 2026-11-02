import { fetchRoomoraApi } from "@/lib/roomora-api";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loginAgainstApi } from "@/lib/login-api";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body?.username !== "string" || typeof body?.password !== "string" || !body.username.trim() || !body.password) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const result = await loginAgainstApi(API_BASE, { username: body.username.trim(), password: body.password }, fetchRoomoraApi);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const jar = await cookies();
  jar.set("roomora_session", result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return NextResponse.json({ user: result.user });
}
