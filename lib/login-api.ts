type LoginUser = { id: string; name: string; username: string; role: "admin" | "reception" };
type LoginResult =
  | { ok: true; token: string; user: LoginUser }
  | { ok: false; status: number; error: string };

export async function loginAgainstApi(baseUrl: string, credentials: { username: string; password: string }, fetcher: typeof fetch = fetch): Promise<LoginResult> {
  try {
    const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      console.error("login_upstream_invalid_json", { status: response.status });
      return { ok: false, status: 502, error: "auth_service_invalid_response" };
    }
    if (!response.ok) {
      if (response.status === 401 && payload?.error === "invalid_credentials") {
        return { ok: false, status: 401, error: "invalid_credentials" };
      }
      if (response.status === 503 && ["d1_read_limit_exceeded", "d1_write_limit_exceeded"].includes(payload?.error)) {
        return { ok: false, status: 503, error: payload.error };
      }
      console.error("login_upstream_failed", { status: response.status });
      return { ok: false, status: response.status === 429 ? 429 : 503, error: response.status === 429 ? "too_many_attempts" : "auth_service_unavailable" };
    }
    const user = payload?.user;
    if (typeof payload?.token !== "string" || !/^[A-Za-z0-9_-]{32,}$/.test(payload.token) ||
        !user || ![user.id, user.name, user.username].every((value: unknown) => typeof value === "string" && value.length > 0) ||
        !["admin", "reception"].includes(user.role)) {
      console.error("login_upstream_invalid_payload");
      return { ok: false, status: 502, error: "auth_service_invalid_response" };
    }
    return { ok: true, token: payload.token, user };
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    console.error("login_upstream_unreachable", { timeout });
    return { ok: false, status: timeout ? 504 : 503, error: timeout ? "auth_service_timeout" : "auth_service_unavailable" };
  }
}
