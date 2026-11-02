import { fetchRoomoraApi } from "@/lib/roomora-api";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.ROOMORA_API_BASE_URL || "https://roomora.mohamed27abdelnaby.workers.dev";

export async function GET() {
  const jar = await cookies();
  const token = jar.get("roomora_session")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const response = await fetchRoomoraApi(`${API_BASE}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });

    // Only a confirmed invalid/expired session should sign the user out.
    // A backend outage must not delete a potentially valid session.
    if (response.status === 401) {
      jar.delete("roomora_session");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || (response.ok && !payload.user)) {
      console.error("session_upstream_invalid_response", { status: response.status });
      return NextResponse.json({ error: "auth_service_invalid_response" }, { status: 502 });
    }
    return NextResponse.json(payload, { status: response.status });
  } catch {
    console.error("session_upstream_unreachable");
    return NextResponse.json({ error: "auth_service_unavailable" }, { status: 503 });
  }
}
