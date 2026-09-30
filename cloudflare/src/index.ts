export interface Env {
  DB: D1Database;
  SETUP_KEY?: string;
}

type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "reception";
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-setup-key"
};

const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", ...cors, ...(init.headers || {}) }
});

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}

async function derivePassword(password: string, salt: Uint8Array, iterations = 210000) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return `pbkdf2_sha256$210000$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

async function verifyPassword(password: string, encoded: string) {
  const [algo, iter, saltB64, hashB64] = encoded.split("$");
  if (algo !== "pbkdf2_sha256" || !iter || !saltB64 || !hashB64) return false;
  const derived = await derivePassword(password, base64ToBytes(saltB64), Number(iter));
  const expected = base64ToBytes(hashB64);
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

async function requireSession(request: Request, env: Env): Promise<SessionUser | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.name, u.username, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1
      AND s.expires_at > CURRENT_TIMESTAMP
      AND u.active = 1
    LIMIT 1
  `).bind(tokenHash).first<SessionUser>();
  if (!row) return null;
  await env.DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?1").bind(tokenHash).run();
  return row;
}

function randomToken(bytes = 32) {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function readJson<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS rooms FROM rooms").first<{ rooms: number }>();
      return json({ ok: true, service: "roomora-api", database: "connected", rooms: row?.rooms ?? 0 });
    }

    if (url.pathname === "/api/setup/status" && request.method === "GET") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS users FROM users").first<{ users: number }>();
      return json({ setupRequired: (row?.users ?? 0) === 0 });
    }

    if (url.pathname === "/api/setup/admin" && request.method === "POST") {
      if (!env.SETUP_KEY) return json({ error: "setup_disabled" }, { status: 503 });
      if (request.headers.get("x-setup-key") !== env.SETUP_KEY) return json({ error: "forbidden" }, { status: 403 });

      const count = await env.DB.prepare("SELECT COUNT(*) AS users FROM users").first<{ users: number }>();
      if ((count?.users ?? 0) > 0) return json({ error: "setup_already_completed" }, { status: 409 });

      const body = await readJson<{ name?: string; username?: string; password?: string }>(request);
      const name = body?.name?.trim();
      const username = body?.username?.trim().toLowerCase();
      const password = body?.password || "";
      if (!name || !username || password.length < 10) return json({ error: "invalid_setup_payload" }, { status: 400 });

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      await env.DB.prepare(`
        INSERT INTO users (id, name, username, password_hash, role, active)
        VALUES (?1, ?2, ?3, ?4, 'admin', 1)
      `).bind(id, name, username, passwordHash).run();

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'bootstrap_admin_created', 'user', ?1, '{"source":"setup"}')
      `).bind(id).run();

      return json({ ok: true });
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJson<{ username?: string; password?: string }>(request);
      const username = body?.username?.trim().toLowerCase();
      const password = body?.password || "";
      if (!username || !password) return json({ error: "invalid_credentials" }, { status: 401 });

      const user = await env.DB.prepare(`
        SELECT id, name, username, role, password_hash
        FROM users
        WHERE username = ?1 AND active = 1
        LIMIT 1
      `).bind(username).first<SessionUser & { password_hash: string }>();

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return json({ error: "invalid_credentials" }, { status: 401 });
      }

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString().replace("T", " ").replace("Z", "");
      await env.DB.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hint)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `).bind(
        crypto.randomUUID(),
        user.id,
        tokenHash,
        expires,
        request.headers.get("user-agent")?.slice(0, 255) || null,
        request.headers.get("cf-connecting-ip")?.slice(0, 64) || null
      ).run();

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
        VALUES (?1, 'login', 'session', ?2)
      `).bind(user.id, tokenHash.slice(0, 12)).run();

      return json({
        token,
        user: { id: user.id, name: user.name, username: user.username, role: user.role }
      });
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await requireSession(request, env);
      if (!user) return json({ error: "unauthorized" }, { status: 401 });
      return json({ user });
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const auth = request.headers.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token) {
        const tokenHash = await sha256Hex(token);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
      }
      return json({ ok: true });
    }

    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error: "unauthorized" }, { status: 401 });
      if (actor.role !== "admin") return json({ error: "forbidden" }, { status: 403 });

      const result = await env.DB.prepare(`
        SELECT id, name, username, role, active, created_at
        FROM users
        ORDER BY created_at DESC
      `).all();
      return json(result.results);
    }

    if (url.pathname === "/api/admin/users" && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error: "unauthorized" }, { status: 401 });
      if (actor.role !== "admin") return json({ error: "forbidden" }, { status: 403 });

      const body = await readJson<{ name?: string; username?: string; password?: string; role?: "admin" | "reception" }>(request);
      const name = body?.name?.trim();
      const username = body?.username?.trim().toLowerCase();
      const password = body?.password || "";
      const role = body?.role === "admin" ? "admin" : "reception";
      if (!name || !username || password.length < 10) return json({ error: "invalid_user_payload" }, { status: 400 });

      const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?1 LIMIT 1").bind(username).first();
      if (existing) return json({ error: "username_exists" }, { status: 409 });

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      await env.DB.prepare(`
        INSERT INTO users (id, name, username, password_hash, role, active)
        VALUES (?1, ?2, ?3, ?4, ?5, 1)
      `).bind(id, name, username, passwordHash, role).run();

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'user_created', 'user', ?2, ?3)
      `).bind(actor.id, id, JSON.stringify({ role })).run();

      return json({ id, name, username, role, active: 1 }, { status: 201 });
    }

    if (url.pathname.startsWith("/api/admin/users/") && request.method === "PATCH") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error: "unauthorized" }, { status: 401 });
      if (actor.role !== "admin") return json({ error: "forbidden" }, { status: 403 });

      const userId = url.pathname.split("/").pop() || "";
      const body = await readJson<{ active?: boolean }>(request);
      if (!userId || typeof body?.active !== "boolean") return json({ error: "invalid_payload" }, { status: 400 });
      if (userId === actor.id && body.active === false) return json({ error: "cannot_disable_self" }, { status: 409 });

      const updated = await env.DB.prepare("UPDATE users SET active = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2")
        .bind(body.active ? 1 : 0, userId).run();
      if (!updated.meta.changes) return json({ error: "user_not_found" }, { status: 404 });

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'user_status_changed', 'user', ?2, ?3)
      `).bind(actor.id, userId, JSON.stringify({ active: body.active })).run();

      return json({ ok: true });
    }

    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      const user = await requireSession(request, env);
      if (!user) return json({ error: "unauthorized" }, { status: 401 });

      const [rooms, settings, items, shifts] = await Promise.all([
        env.DB.prepare(`
          SELECT id, number, floor, room_type, operational_status
          FROM rooms
          ORDER BY floor, CASE WHEN number GLOB '[0-9]*' THEN CAST(number AS INTEGER) ELSE 0 END, number
        `).all(),
        env.DB.prepare(`
          SELECT hotel_name, timezone, business_day_start, default_checkout_time
          FROM hotel_settings WHERE id = 1
        `).first(),
        env.DB.prepare(`
          SELECT id, name, unit, max_per_request, max_per_business_day, max_per_stay
          FROM request_items WHERE active = 1 ORDER BY name
        `).all(),
        env.DB.prepare(`
          SELECT id, name, start_time, end_time
          FROM shifts WHERE active = 1 ORDER BY start_time
        `).all()
      ]);

      return json({
        user,
        rooms: rooms.results,
        settings,
        requestItems: items.results,
        shifts: shifts.results
      });
    }

    if (url.pathname === "/api/rooms" && request.method === "GET") {
      const user = await requireSession(request, env);
      if (!user) return json({ error: "unauthorized" }, { status: 401 });

      const result = await env.DB.prepare(`
        SELECT id, number, floor, room_type, operational_status
        FROM rooms
        ORDER BY floor, CASE WHEN number GLOB '[0-9]*' THEN CAST(number AS INTEGER) ELSE 0 END, number
      `).all();
      return json(result.results);
    }

    return json({ error: "not_found" }, { status: 404 });
  }
};
