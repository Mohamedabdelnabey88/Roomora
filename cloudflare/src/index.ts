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

async function derivePassword(password: string, salt: Uint8Array, iterations = 100000) {
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
  return `pbkdf2_sha256$100000$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
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

async function hotelBusinessDay(env: Env, at = new Date()) {
  const settings = await env.DB.prepare(`
    SELECT timezone, business_day_start FROM hotel_settings WHERE id = 1
  `).first<{ timezone:string; business_day_start:string }>();

  const timezone = settings?.timezone || "Asia/Riyadh";
  const cutoff = settings?.business_day_start || "06:00";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(at);

  const read = (type:string) => parts.find(p=>p.type===type)?.value || "00";
  const localDate = read("year")+"-"+read("month")+"-"+read("day");
  const minutes = Number(read("hour"))*60 + Number(read("minute"));
  const [cutHour, cutMinute] = cutoff.split(":").map(Number);
  if (minutes >= cutHour*60 + cutMinute) return localDate;

  const anchor = new Date(localDate+"T12:00:00Z");
  anchor.setUTCDate(anchor.getUTCDate()-1);
  return anchor.toISOString().slice(0,10);
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
      return json({ setupRequired: (row?.users ?? 0) === 0, setupKeyConfigured: Boolean(env.SETUP_KEY) });
    }

    if (url.pathname === "/api/setup/admin" && request.method === "POST") {
      if (!env.SETUP_KEY) return json({ error: "setup_disabled" }, { status: 503 });
      if (request.headers.get("x-setup-key") !== env.SETUP_KEY) return json({ error: "forbidden" }, { status: 403 });

      let stage = "validate";
      try {
        stage = "count_users";
        const count = await env.DB.prepare("SELECT COUNT(*) AS users FROM users").first<{ users: number }>();
        if ((count?.users ?? 0) > 0) return json({ error: "setup_already_completed" }, { status: 409 });

        stage = "read_payload";
        const body = await readJson<{ name?: string; username?: string; password?: string }>(request);
        const name = body?.name?.trim();
        const username = body?.username?.trim().toLowerCase();
        const password = body?.password || "";
        if (!name || !username || password.length < 10) return json({ error: "invalid_setup_payload" }, { status: 400 });

        stage = "hash_password";
        const id = crypto.randomUUID();
        const passwordHash = await hashPassword(password);

        stage = "insert_user";
        await env.DB.prepare(`
          INSERT INTO users (id, name, username, password_hash, role, active)
          VALUES (?1, ?2, ?3, ?4, 'admin', 1)
        `).bind(id, name, username, passwordHash).run();

        stage = "audit";
        await env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'bootstrap_admin_created', 'user', ?1, '{"source":"setup"}')
        `).bind(id).run();

        return json({ ok: true });
      } catch (error) {
        console.error("setup_admin_failed", { stage, error: error instanceof Error ? error.message : String(error) });
        return json({ error: "setup_internal_error", stage }, { status: 500 });
      }
    }

    if (url.pathname === "/api/setup/reset-admin" && request.method === "POST") {
      if (!env.SETUP_KEY) return json({ error: "setup_disabled" }, { status: 503 });
      if (request.headers.get("x-setup-key") !== env.SETUP_KEY) return json({ error: "forbidden" }, { status: 403 });

      try {
        const body = await readJson<{ username?: string; password?: string }>(request);
        const username = body?.username?.trim().toLowerCase();
        const password = body?.password || "";
        if (!username || password.length < 10) return json({ error: "invalid_reset_payload" }, { status: 400 });

        const admin = await env.DB.prepare(`
          SELECT id, username FROM users
          WHERE username = ?1 AND role = 'admin'
          LIMIT 1
        `).bind(username).first<{ id: string; username: string }>();

        if (!admin) return json({ error: "admin_not_found" }, { status: 404 });

        const passwordHash = await hashPassword(password);
        await env.DB.prepare(`
          UPDATE users
          SET password_hash = ?1, active = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?2
        `).bind(passwordHash, admin.id).run();

        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(admin.id).run();

        await env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'admin_password_reset_via_setup_key', 'user', ?1, '{"source":"setup_recovery"}')
        `).bind(admin.id).run();

        return json({ ok: true });
      } catch (error) {
        console.error("reset_admin_failed", error instanceof Error ? error.message : String(error));
        return json({ error: "reset_internal_error" }, { status: 500 });
      }
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

    if (url.pathname === "/api/stays" && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error: "unauthorized" }, { status: 401 });

      const body = await readJson<{
        roomId?: string;
        guestName?: string;
        guestPhone?: string;
        expectedCheckoutAt?: string;
      }>(request);

      const roomId = body?.roomId?.trim();
      const guestName = body?.guestName?.trim();
      const guestPhone = body?.guestPhone?.trim() || null;
      const expectedCheckoutAt = body?.expectedCheckoutAt?.trim();

      if (!roomId || !guestName || !expectedCheckoutAt) {
        return json({ error: "invalid_checkin_payload" }, { status: 400 });
      }

      const room = await env.DB.prepare(`
        SELECT id, number, operational_status
        FROM rooms
        WHERE id = ?1
        LIMIT 1
      `).bind(roomId).first<{ id:string; number:string; operational_status:string }>();

      if (!room) return json({ error: "room_not_found" }, { status: 404 });
      if (room.operational_status !== "available") {
        return json({ error: "room_not_available" }, { status: 409 });
      }

      const existing = await env.DB.prepare(`
        SELECT id FROM stays
        WHERE room_id = ?1 AND status = 'in_house'
        LIMIT 1
      `).bind(roomId).first();

      if (existing) return json({ error: "active_stay_exists" }, { status: 409 });

      const now = new Date();
      const checkout = new Date(expectedCheckoutAt);
      if (!Number.isFinite(checkout.getTime()) || checkout.getTime() <= now.getTime()) {
        return json({ error: "invalid_checkout_time" }, { status: 400 });
      }

      const stayId = crypto.randomUUID();
      const checkinAt = now.toISOString();

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO stays (
            id, room_id, guest_name, guest_phone, checkin_at,
            expected_checkout_at, status, created_by
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'in_house', ?7)
        `).bind(stayId, roomId, guestName, guestPhone, checkinAt, checkout.toISOString(), actor.id),
        env.DB.prepare(`
          UPDATE rooms
          SET operational_status = 'occupied', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?1
        `).bind(roomId),
        env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'stay_checkin', 'stay', ?2, ?3)
        `).bind(actor.id, stayId, JSON.stringify({ roomId, roomNumber: room.number }))
      ]);

      return json({
        id: stayId,
        roomId,
        guestName,
        guestPhone,
        checkinAt,
        expectedCheckoutAt: checkout.toISOString(),
        status: "in_house"
      }, { status: 201 });
    }

    if (url.pathname.match(/^\/api\/stays\/[^/]+\/extend$/) && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error: "unauthorized" }, { status: 401 });

      const stayId = url.pathname.split("/")[3] || "";
      const body = await readJson<{ expectedCheckoutAt?: string; reason?: string }>(request);
      const newCheckout = body?.expectedCheckoutAt?.trim();
      if (!stayId || !newCheckout) return json({ error: "invalid_extension_payload" }, { status: 400 });

      const stay = await env.DB.prepare(`
        SELECT id, room_id, expected_checkout_at
        FROM stays
        WHERE id = ?1 AND status = 'in_house'
        LIMIT 1
      `).bind(stayId).first<{ id:string; room_id:string; expected_checkout_at:string }>();

      if (!stay) return json({ error: "active_stay_not_found" }, { status: 404 });

      const next = new Date(newCheckout);
      const previous = new Date(stay.expected_checkout_at);
      if (!Number.isFinite(next.getTime()) || next.getTime() <= previous.getTime()) {
        return json({ error: "extension_must_be_later" }, { status: 400 });
      }

      const extensionId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO stay_extensions (
            id, stay_id, previous_checkout_at, new_checkout_at, reason, changed_by
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        `).bind(extensionId, stayId, stay.expected_checkout_at, next.toISOString(), body?.reason?.trim() || null, actor.id),
        env.DB.prepare(`
          UPDATE stays
          SET expected_checkout_at = ?1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?2
        `).bind(next.toISOString(), stayId),
        env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'stay_extended', 'stay', ?2, ?3)
        `).bind(actor.id, stayId, JSON.stringify({ previous: stay.expected_checkout_at, next: next.toISOString() }))
      ]);

      return json({ ok: true, expectedCheckoutAt: next.toISOString() });
    }

    if (url.pathname.match(/^\/api\/stays\/[^/]+\/checkout$/) && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error: "unauthorized" }, { status: 401 });

      const stayId = url.pathname.split("/")[3] || "";
      const stay = await env.DB.prepare(`
        SELECT id, room_id
        FROM stays
        WHERE id = ?1 AND status = 'in_house'
        LIMIT 1
      `).bind(stayId).first<{ id:string; room_id:string }>();

      if (!stay) return json({ error: "active_stay_not_found" }, { status: 404 });

      const actualCheckoutAt = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE stays
          SET status = 'checked_out', actual_checkout_at = ?1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?2
        `).bind(actualCheckoutAt, stayId),
        env.DB.prepare(`
          UPDATE rooms
          SET operational_status = 'available', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?1
        `).bind(stay.room_id),
        env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'stay_checkout', 'stay', ?2, ?3)
        `).bind(actor.id, stayId, JSON.stringify({ roomId: stay.room_id, actualCheckoutAt }))
      ]);

      return json({ ok: true, actualCheckoutAt });
    }

    if (url.pathname === "/api/request-items" && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const result = await env.DB.prepare(`
        SELECT id, name, unit, max_per_request, max_per_business_day, max_per_stay
        FROM request_items
        WHERE active = 1
        ORDER BY name
      `).all();

      return json(result.results);
    }

    if (url.pathname === "/api/requests" && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const result = await env.DB.prepare(`
        SELECT
          sr.id,
          sr.stay_id,
          sr.room_id,
          sr.status,
          sr.priority,
          sr.business_day,
          sr.requested_at,
          sr.delivered_at,
          r.number AS room_number,
          s.guest_name,
          GROUP_CONCAT(ri.name || ' × ' || srl.quantity, '، ') AS items,
          MAX(ar.reason) AS approval_reason
        FROM service_requests sr
        JOIN rooms r ON r.id = sr.room_id
        JOIN stays s ON s.id = sr.stay_id
        LEFT JOIN service_request_lines srl ON srl.request_id = sr.id
        LEFT JOIN request_items ri ON ri.id = srl.item_id
        LEFT JOIN approval_requests ar
          ON ar.service_request_id = sr.id
         AND ar.status = 'pending'
        WHERE sr.status NOT IN ('delivered','cancelled')
        GROUP BY sr.id
        ORDER BY sr.requested_at ASC
        LIMIT 100
      `).all();

      return json(result.results);
    }

    if (url.pathname === "/api/requests" && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const body = await readJson<{
        stayId?:string;
        lines?:Array<{ itemId?:string; quantity?:number }>;
        note?:string;
      }>(request);

      const stayId = body?.stayId?.trim();
      const lines = (body?.lines || [])
        .map(line=>({ itemId:line.itemId?.trim() || "", quantity:Number(line.quantity || 0) }))
        .filter(line=>line.itemId && Number.isInteger(line.quantity) && line.quantity > 0);

      if (!stayId || lines.length === 0) return json({ error:"invalid_request_payload" }, { status:400 });

      const stay = await env.DB.prepare(`
        SELECT s.id, s.room_id, r.number AS room_number
        FROM stays s
        JOIN rooms r ON r.id = s.room_id
        WHERE s.id = ?1 AND s.status = 'in_house'
        LIMIT 1
      `).bind(stayId).first<{ id:string; room_id:string; room_number:string }>();

      if (!stay) return json({ error:"active_stay_not_found" }, { status:404 });

      const businessDay = await hotelBusinessDay(env);
      const violations:string[] = [];
      const validated:Array<{itemId:string;quantity:number;name:string}> = [];

      for (const line of lines) {
        const item = await env.DB.prepare(`
          SELECT id, name, max_per_request, max_per_business_day, max_per_stay
          FROM request_items
          WHERE id = ?1 AND active = 1
          LIMIT 1
        `).bind(line.itemId).first<{
          id:string; name:string;
          max_per_request:number|null;
          max_per_business_day:number|null;
          max_per_stay:number|null;
        }>();

        if (!item) return json({ error:"request_item_not_found", itemId:line.itemId }, { status:404 });

        if (item.max_per_request !== null && line.quantity > item.max_per_request) {
          violations.push(item.name + ": تجاوز حد الطلب الواحد");
        }

        const dayUsage = await env.DB.prepare(`
          SELECT COALESCE(SUM(srl.quantity),0) AS qty
          FROM service_request_lines srl
          JOIN service_requests sr ON sr.id = srl.request_id
          WHERE sr.stay_id = ?1
            AND sr.business_day = ?2
            AND srl.item_id = ?3
            AND sr.status NOT IN ('cancelled')
        `).bind(stayId,businessDay,line.itemId).first<{qty:number}>();

        const stayUsage = await env.DB.prepare(`
          SELECT COALESCE(SUM(srl.quantity),0) AS qty
          FROM service_request_lines srl
          JOIN service_requests sr ON sr.id = srl.request_id
          WHERE sr.stay_id = ?1
            AND srl.item_id = ?2
            AND sr.status NOT IN ('cancelled')
        `).bind(stayId,line.itemId).first<{qty:number}>();

        if (item.max_per_business_day !== null && Number(dayUsage?.qty || 0) + line.quantity > item.max_per_business_day) {
          violations.push(item.name + ": تجاوز الحد اليومي");
        }
        if (item.max_per_stay !== null && Number(stayUsage?.qty || 0) + line.quantity > item.max_per_stay) {
          violations.push(item.name + ": تجاوز حد الإقامة");
        }

        validated.push({ itemId:item.id, quantity:line.quantity, name:item.name });
      }

      const requestId = crypto.randomUUID();
      const requiresApproval = violations.length > 0;
      const statements:D1PreparedStatement[] = [
        env.DB.prepare(`
          INSERT INTO service_requests (
            id, stay_id, room_id, status, priority, business_day, requested_by, note
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `).bind(
          requestId,
          stayId,
          stay.room_id,
          requiresApproval ? "approval_required" : "new",
          requiresApproval ? "warning" : "normal",
          businessDay,
          actor.id,
          body?.note?.trim() || null
        )
      ];

      for (const line of validated) {
        statements.push(env.DB.prepare(`
          INSERT INTO service_request_lines (id, request_id, item_id, quantity)
          VALUES (?1, ?2, ?3, ?4)
        `).bind(crypto.randomUUID(),requestId,line.itemId,line.quantity));
      }

      if (requiresApproval) {
        statements.push(env.DB.prepare(`
          INSERT INTO approval_requests (id, service_request_id, reason, status)
          VALUES (?1, ?2, ?3, 'pending')
        `).bind(crypto.randomUUID(),requestId,violations.join(" | ")));
      }

      statements.push(env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'service_request_created', 'service_request', ?2, ?3)
      `).bind(actor.id,requestId,JSON.stringify({
        roomNumber:stay.room_number,
        businessDay,
        requiresApproval,
        violations
      })));

      await env.DB.batch(statements);

      return json({
        id:requestId,
        status:requiresApproval ? "approval_required" : "new",
        requiresApproval,
        violations
      },{status:201});
    }

    if (url.pathname.match(/^\/api\/requests\/[^/]+\/status$/) && request.method === "PATCH") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const requestId = url.pathname.split("/")[3] || "";
      const body = await readJson<{status?:string}>(request);
      const next = body?.status || "";
      const allowed = ["acknowledged","preparing","delivered","cancelled"];
      if (!allowed.includes(next)) return json({ error:"invalid_request_status" }, { status:400 });

      const current = await env.DB.prepare(`
        SELECT id,status FROM service_requests WHERE id = ?1 LIMIT 1
      `).bind(requestId).first<{id:string;status:string}>();
      if (!current) return json({ error:"request_not_found" }, { status:404 });
      if (current.status === "approval_required") return json({ error:"approval_required" }, { status:409 });

      const transitions:Record<string,string[]> = {
        new:["acknowledged","cancelled"],
        acknowledged:["preparing","delivered","cancelled"],
        preparing:["delivered","cancelled"]
      };
      if (!(transitions[current.status] || []).includes(next)) {
        return json({ error:"invalid_status_transition", from:current.status, to:next }, { status:409 });
      }

      const deliveredAt = next === "delivered" ? new Date().toISOString() : null;
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE service_requests
          SET status = ?1,
              acknowledged_by = CASE WHEN ?1 IN ('acknowledged','preparing') AND acknowledged_by IS NULL THEN ?2 ELSE acknowledged_by END,
              delivered_by = CASE WHEN ?1 = 'delivered' THEN ?2 ELSE delivered_by END,
              delivered_at = CASE WHEN ?1 = 'delivered' THEN ?3 ELSE delivered_at END
          WHERE id = ?4
        `).bind(next,actor.id,deliveredAt,requestId),
        env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'service_request_status_changed', 'service_request', ?2, ?3)
        `).bind(actor.id,requestId,JSON.stringify({from:current.status,to:next}))
      ]);

      return json({ok:true,status:next});
    }

    if (url.pathname.match(/^\/api\/requests\/[^/]+\/decision$/) && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });
      if (actor.role !== "admin") return json({ error:"forbidden" }, { status:403 });

      const requestId = url.pathname.split("/")[3] || "";
      const body = await readJson<{decision?:"approved"|"rejected";note?:string}>(request);
      if (!body?.decision || !["approved","rejected"].includes(body.decision)) {
        return json({ error:"invalid_decision" }, { status:400 });
      }

      const approval = await env.DB.prepare(`
        SELECT id,status FROM approval_requests
        WHERE service_request_id = ?1 AND status = 'pending'
        LIMIT 1
      `).bind(requestId).first<{id:string;status:string}>();
      if (!approval) return json({ error:"pending_approval_not_found" }, { status:404 });

      const requestStatus = body.decision === "approved" ? "new" : "cancelled";
      const now = new Date().toISOString();

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE approval_requests
          SET status = ?1, decided_by = ?2, decision_note = ?3, decided_at = ?4
          WHERE id = ?5
        `).bind(body.decision,actor.id,body.note?.trim() || null,now,approval.id),
        env.DB.prepare(`
          UPDATE service_requests SET status = ?1 WHERE id = ?2
        `).bind(requestStatus,requestId),
        env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'service_request_decision', 'service_request', ?2, ?3)
        `).bind(actor.id,requestId,JSON.stringify({decision:body.decision}))
      ]);

      return json({ok:true,status:requestStatus});
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
        SELECT
          r.id,
          r.number,
          r.floor,
          r.room_type,
          r.operational_status,
          s.id AS stay_id,
          s.guest_name,
          s.guest_phone,
          s.checkin_at,
          s.expected_checkout_at,
          (
            SELECT COUNT(*)
            FROM service_requests sr
            WHERE sr.room_id = r.id
              AND sr.status NOT IN ('delivered','cancelled')
          ) AS open_requests
        FROM rooms r
        LEFT JOIN stays s
          ON s.room_id = r.id
         AND s.status = 'in_house'
        ORDER BY r.floor, CASE WHEN r.number GLOB '[0-9]*' THEN CAST(r.number AS INTEGER) ELSE 0 END, r.number
      `).all();
      return json(result.results);
    }

    return json({ error: "not_found" }, { status: 404 });
  }
};
