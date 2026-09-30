import { NextResponse } from "next/server";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function POST(request: Request) {
  const body = await request.json();
  const setupKey = request.headers.get("x-setup-key") || "";

  const response = await fetch(`${API_BASE}/api/setup/admin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-setup-key": setupKey
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
