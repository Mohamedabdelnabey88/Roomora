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
  "access-control-allow-origin": "https://roomora-lac.vercel.app",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
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

async function ensureReservationsSchema(env: Env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        guest_name TEXT NOT NULL,
        guest_phone TEXT,
        checkin_at TEXT NOT NULL,
        checkout_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','checked_in','cancelled')),
        note TEXT,
        stay_id TEXT REFERENCES stays(id),
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reservations_room_dates ON reservations(room_id,checkin_at,checkout_at,status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reservations_status_checkin ON reservations(status,checkin_at)`)
  ]);
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
      const count = await env.DB.prepare("SELECT COUNT(*) AS users FROM users").first<{ users: number }>();
      if ((count?.users ?? 0) > 0) return json({ error: "not_found" }, { status: 404 });
      return json({ error: "setup_required" }, { status: 409 });
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


    if (url.pathname === "/api/reservations/calendar" && request.method === "GET") {
      await ensureReservationsSchema(env);
      const actor=await requireSession(request,env);
      if(!actor)return json({error:"unauthorized"},{status:401});

      const rooms=await env.DB.prepare(`
        SELECT id,number,floor,room_type,operational_status
        FROM rooms
        ORDER BY floor, CASE WHEN number GLOB '[0-9]*' THEN CAST(number AS INTEGER) ELSE 0 END, number
      `).all<{
        id:string;number:string;floor:number;room_type:string;operational_status:string
      }>();

      const result=[];
      for(const room of rooms.results){
        const activeStay=await env.DB.prepare(`
          SELECT id,guest_name,guest_phone,checkin_at,expected_checkout_at
          FROM stays
          WHERE room_id=?1 AND status='in_house'
          LIMIT 1
        `).bind(room.id).first();

        const reservations=await env.DB.prepare(`
          SELECT id,guest_name,guest_phone,checkin_at,checkout_at,status
          FROM reservations
          WHERE room_id=?1 AND status='booked'
          ORDER BY datetime(checkin_at) ASC
          LIMIT 100
        `).bind(room.id).all();

        result.push({
          ...room,
          activeStay:activeStay||null,
          reservations:reservations.results
        });
      }
      return json(result);
    }

    if (url.pathname === "/api/reservations/availability" && request.method === "GET") {
      await ensureReservationsSchema(env);
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const fromRaw=url.searchParams.get("from") || "";
      const toRaw=url.searchParams.get("to") || "";
      const from=new Date(fromRaw),to=new Date(toRaw);
      if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to){
        return json({error:"invalid_reservation_range"},{status:400});
      }

      const rooms=await env.DB.prepare(`
        SELECT id,number,floor,room_type,operational_status
        FROM rooms
        ORDER BY floor, CASE WHEN number GLOB '[0-9]*' THEN CAST(number AS INTEGER) ELSE 0 END, number
      `).all<{
        id:string;number:string;floor:number;room_type:string;operational_status:string
      }>();

      const result=[];
      for(const room of rooms.results){
        let available=room.operational_status!=="out_of_service";
        let reason=available?"":"الغرفة خارج الخدمة";

        if(available){
          const stayConflict=await env.DB.prepare(`
            SELECT id,guest_name,expected_checkout_at
            FROM stays
            WHERE room_id=?1 AND status='in_house'
              AND datetime(expected_checkout_at) > datetime(?2)
            LIMIT 1
          `).bind(room.id,from.toISOString()).first<{id:string;guest_name:string;expected_checkout_at:string}>();
          if(stayConflict){
            available=false;
            reason="إقامة حالية حتى "+stayConflict.expected_checkout_at;
          }
        }

        if(available){
          const reservationConflict=await env.DB.prepare(`
            SELECT id,guest_name,checkin_at,checkout_at
            FROM reservations
            WHERE room_id=?1 AND status='booked'
              AND datetime(checkin_at) < datetime(?3)
              AND datetime(checkout_at) > datetime(?2)
            ORDER BY checkin_at
            LIMIT 1
          `).bind(room.id,from.toISOString(),to.toISOString()).first<{id:string;guest_name:string;checkin_at:string;checkout_at:string}>();
          if(reservationConflict){
            available=false;
            reason="حجز متداخل";
          }
        }

        result.push({...room,available,reason});
      }
      return json(result);
    }

    if (url.pathname === "/api/reservations" && request.method === "GET") {
      await ensureReservationsSchema(env);
      const actor=await requireSession(request,env);
      if(!actor)return json({error:"unauthorized"},{status:401});
      const result=await env.DB.prepare(`
        SELECT rv.id,rv.room_id,rv.guest_name,rv.guest_phone,rv.checkin_at,rv.checkout_at,
               rv.status,rv.note,rv.stay_id,rv.created_at,
               r.number AS room_number,r.floor,r.room_type,
               u.name AS created_by_name
        FROM reservations rv
        JOIN rooms r ON r.id=rv.room_id
        LEFT JOIN users u ON u.id=rv.created_by
        ORDER BY
          CASE WHEN rv.status='booked' THEN 0 ELSE 1 END,
          rv.checkin_at ASC
        LIMIT 1000
      `).all();
      return json(result.results);
    }

    if (url.pathname === "/api/reservations" && request.method === "POST") {
      await ensureReservationsSchema(env);
      const actor=await requireSession(request,env);
      if(!actor)return json({error:"unauthorized"},{status:401});
      const body=await readJson<{
        roomId?:string;guestName?:string;guestPhone?:string;
        checkinAt?:string;checkoutAt?:string;note?:string;
      }>(request);
      const roomId=body?.roomId?.trim()||"";
      const guestName=body?.guestName?.trim()||"";
      const guestPhone=body?.guestPhone?.trim()||null;
      const checkin=new Date(body?.checkinAt||"");
      const checkout=new Date(body?.checkoutAt||"");
      if(!roomId||!guestName||!Number.isFinite(checkin.getTime())||!Number.isFinite(checkout.getTime())||checkin>=checkout){
        return json({error:"invalid_reservation_payload"},{status:400});
      }
      if(checkin.getTime()<Date.now()-5*60*1000){
        return json({error:"reservation_must_be_future"},{status:400});
      }

      const room=await env.DB.prepare(`
        SELECT id,number,operational_status FROM rooms WHERE id=?1 LIMIT 1
      `).bind(roomId).first<{id:string;number:string;operational_status:string}>();
      if(!room)return json({error:"room_not_found"},{status:404});
      if(room.operational_status==="out_of_service")return json({error:"room_out_of_service"},{status:409});

      const stayConflict=await env.DB.prepare(`
        SELECT id,expected_checkout_at FROM stays
        WHERE room_id=?1 AND status='in_house'
          AND datetime(expected_checkout_at) > datetime(?2)
        LIMIT 1
      `).bind(roomId,checkin.toISOString()).first();
      if(stayConflict)return json({error:"reservation_conflict_active_stay"},{status:409});

      const reservationConflict=await env.DB.prepare(`
        SELECT id,guest_name,checkin_at,checkout_at
        FROM reservations
        WHERE room_id=?1 AND status='booked'
          AND datetime(checkin_at) < datetime(?3)
          AND datetime(checkout_at) > datetime(?2)
        LIMIT 1
      `).bind(roomId,checkin.toISOString(),checkout.toISOString()).first();
      if(reservationConflict)return json({error:"reservation_conflict",conflict:reservationConflict},{status:409});

      const id=crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO reservations(
            id,room_id,guest_name,guest_phone,checkin_at,checkout_at,status,note,created_by
          ) VALUES(?1,?2,?3,?4,?5,?6,'booked',?7,?8)
        `).bind(id,roomId,guestName,guestPhone,checkin.toISOString(),checkout.toISOString(),body?.note?.trim()||null,actor.id),
        env.DB.prepare(`
          INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata_json)
          VALUES(?1,'reservation_created','reservation',?2,?3)
        `).bind(actor.id,id,JSON.stringify({roomId,roomNumber:room.number,checkinAt:checkin.toISOString(),checkoutAt:checkout.toISOString()}))
      ]);
      return json({id,status:"booked"},{status:201});
    }

    if (url.pathname.match(/^\/api\/reservations\/[^/]+\/cancel$/) && request.method === "POST") {
      await ensureReservationsSchema(env);
      const actor=await requireSession(request,env);
      if(!actor)return json({error:"unauthorized"},{status:401});
      const reservationId=url.pathname.split("/")[3]||"";
      const current=await env.DB.prepare(`
        SELECT id,status FROM reservations WHERE id=?1 LIMIT 1
      `).bind(reservationId).first<{id:string;status:string}>();
      if(!current)return json({error:"reservation_not_found"},{status:404});
      if(current.status!=="booked")return json({error:"reservation_not_cancellable"},{status:409});
      await env.DB.batch([
        env.DB.prepare("UPDATE reservations SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(reservationId),
        env.DB.prepare(`
          INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id)
          VALUES(?1,'reservation_cancelled','reservation',?2)
        `).bind(actor.id,reservationId)
      ]);
      return json({ok:true});
    }

    if (url.pathname.match(/^\/api\/reservations\/[^/]+\/checkin$/) && request.method === "POST") {
      await ensureReservationsSchema(env);
      const actor=await requireSession(request,env);
      if(!actor)return json({error:"unauthorized"},{status:401});
      const reservationId=url.pathname.split("/")[3]||"";
      const reservation=await env.DB.prepare(`
        SELECT rv.id,rv.room_id,rv.guest_name,rv.guest_phone,rv.checkin_at,rv.checkout_at,rv.status,
               r.number AS room_number,r.operational_status
        FROM reservations rv
        JOIN rooms r ON r.id=rv.room_id
        WHERE rv.id=?1 LIMIT 1
      `).bind(reservationId).first<{
        id:string;room_id:string;guest_name:string;guest_phone:string|null;checkin_at:string;checkout_at:string;
        status:string;room_number:string;operational_status:string
      }>();
      if(!reservation)return json({error:"reservation_not_found"},{status:404});
      if(reservation.status!=="booked")return json({error:"reservation_not_checkin_ready"},{status:409});

      const now=Date.now();
      const plannedIn=new Date(reservation.checkin_at).getTime();
      const plannedOut=new Date(reservation.checkout_at).getTime();
      if(now<plannedIn-2*60*60*1000)return json({error:"checkin_too_early",allowedAt:new Date(plannedIn-2*60*60*1000).toISOString()},{status:409});
      if(now>=plannedOut)return json({error:"reservation_expired"},{status:409});
      if(reservation.operational_status!=="available")return json({error:"room_not_available"},{status:409});

      const activeStay=await env.DB.prepare(`
        SELECT id FROM stays WHERE room_id=?1 AND status='in_house' LIMIT 1
      `).bind(reservation.room_id).first();
      if(activeStay)return json({error:"active_stay_exists"},{status:409});

      const stayId=crypto.randomUUID();
      const checkinAt=new Date().toISOString();
      const write=await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO stays(id,room_id,guest_name,guest_phone,checkin_at,expected_checkout_at,status,created_by)
          SELECT ?1,?2,?3,?4,?5,?6,'in_house',?7
          WHERE NOT EXISTS(SELECT 1 FROM stays WHERE room_id=?2 AND status='in_house')
        `).bind(stayId,reservation.room_id,reservation.guest_name,reservation.guest_phone,checkinAt,reservation.checkout_at,actor.id),
        env.DB.prepare(`
          UPDATE rooms SET operational_status='occupied',updated_at=CURRENT_TIMESTAMP
          WHERE id=?1 AND operational_status='available'
        `).bind(reservation.room_id)
      ]);
      if(!write[0]?.meta?.changes||!write[1]?.meta?.changes){
        if(write[0]?.meta?.changes)await env.DB.prepare("DELETE FROM stays WHERE id=?1").bind(stayId).run();
        return json({error:"room_not_available"},{status:409});
      }

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE reservations SET status='checked_in',stay_id=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2
        `).bind(stayId,reservationId),
        env.DB.prepare(`
          INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata_json)
          VALUES(?1,'reservation_checkin','reservation',?2,?3)
        `).bind(actor.id,reservationId,JSON.stringify({stayId,roomNumber:reservation.room_number,checkinAt}))
      ]);
      return json({ok:true,stayId,checkinAt});
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

      const write = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO stays (
            id, room_id, guest_name, guest_phone, checkin_at,
            expected_checkout_at, status, created_by
          )
          SELECT ?1, r.id, ?3, ?4, ?5, ?6, 'in_house', ?7
          FROM rooms r
          WHERE r.id = ?2
            AND r.operational_status = 'available'
            AND NOT EXISTS (
              SELECT 1 FROM stays s
              WHERE s.room_id = r.id AND s.status = 'in_house'
            )
        `).bind(stayId, roomId, guestName, guestPhone, checkinAt, checkout.toISOString(), actor.id),
        env.DB.prepare(`
          UPDATE rooms
          SET operational_status = 'occupied', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?1
            AND EXISTS (
              SELECT 1 FROM stays s
              WHERE s.id = ?2 AND s.status = 'in_house'
            )
        `).bind(roomId, stayId)
      ]);

      if (!write[0]?.meta?.changes) {
        return json({ error: "room_not_available" }, { status: 409 });
      }

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'stay_checkin', 'stay', ?2, ?3)
      `).bind(actor.id, stayId, JSON.stringify({ roomId, roomNumber: room.number })).run();

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

      const openRequests = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM service_requests
        WHERE stay_id = ?1
          AND status NOT IN ('delivered','cancelled')
      `).bind(stayId).first<{count:number}>();

      if (Number(openRequests?.count || 0) > 0) {
        return json({ error: "open_requests_exist", count: Number(openRequests?.count || 0) }, { status: 409 });
      }

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

      // Keep the production catalog in sync for lightweight catalog additions.
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active) VALUES ('extra-mattress','طراحة','قطعة',1,1,1,1)`),
        env.DB.prepare(`INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active) VALUES ('fine-tissues','فاين / مناديل','علبة',2,4,10,1)`),
        env.DB.prepare(`INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active) VALUES ('towel-small','منشفة صغيرة','قطعة',4,6,12,1)`),
        env.DB.prepare(`INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active) VALUES ('towel-large','منشفة كبيرة','قطعة',2,4,8,1)`),
        env.DB.prepare(`INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active) VALUES ('slippers','سليبر','زوج',2,2,4,1)`),
        env.DB.prepare(`UPDATE request_items SET active=0 WHERE id='towel'`)
      ]);

      const result = await env.DB.prepare(`
        SELECT id, name, unit, max_per_request, max_per_business_day, max_per_stay
        FROM request_items
        WHERE active = 1
        ORDER BY name
      `).all();

      return json(result.results);
    }

    if (url.pathname.startsWith("/api/admin/request-items/") && request.method === "PATCH") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });
      if (actor.role !== "admin") return json({ error:"forbidden" }, { status:403 });

      const itemId = url.pathname.split("/").pop() || "";
      const body = await readJson<{
        maxPerRequest?:number;
        maxPerBusinessDay?:number;
        maxPerStay?:number;
      }>(request);

      const values = [
        Number(body?.maxPerRequest),
        Number(body?.maxPerBusinessDay),
        Number(body?.maxPerStay)
      ];
      if (!itemId || values.some(v => !Number.isInteger(v) || v < 0)) {
        return json({ error:"invalid_limits_payload" }, { status:400 });
      }

      const updated = await env.DB.prepare(`
        UPDATE request_items
        SET max_per_request=?1,
            max_per_business_day=?2,
            max_per_stay=?3
        WHERE id=?4
      `).bind(values[0],values[1],values[2],itemId).run();

      if (!updated.meta.changes) return json({ error:"request_item_not_found" }, { status:404 });

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1,'request_item_limits_updated','request_item',?2,?3)
      `).bind(actor.id,itemId,JSON.stringify({
        maxPerRequest:values[0],
        maxPerBusinessDay:values[1],
        maxPerStay:values[2]
      })).run();

      return json({ok:true});
    }

    if (url.pathname.match(/^\/api\/requests\/[^/]+$/) && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const requestId = url.pathname.split("/")[3] || "";
      const detail = await env.DB.prepare(`
        SELECT
          sr.id, sr.status, sr.priority, sr.business_day, sr.note,
          sr.requested_at, sr.delivered_at,
          r.number AS room_number,
          s.id AS stay_id, s.guest_name, s.guest_phone,
          requester.name AS requested_by_name,
          acknowledger.name AS acknowledged_by_name,
          deliverer.name AS delivered_by_name
        FROM service_requests sr
        JOIN rooms r ON r.id=sr.room_id
        JOIN stays s ON s.id=sr.stay_id
        LEFT JOIN users requester ON requester.id=sr.requested_by
        LEFT JOIN users acknowledger ON acknowledger.id=sr.acknowledged_by
        LEFT JOIN users deliverer ON deliverer.id=sr.delivered_by
        WHERE sr.id=?1
        LIMIT 1
      `).bind(requestId).first();

      if (!detail) return json({ error:"request_not_found" }, { status:404 });

      const [lines, approval, timeline] = await Promise.all([
        env.DB.prepare(`
          SELECT ri.name, ri.unit, srl.quantity
          FROM service_request_lines srl
          JOIN request_items ri ON ri.id=srl.item_id
          WHERE srl.request_id=?1
          ORDER BY ri.name
        `).bind(requestId).all(),
        env.DB.prepare(`
          SELECT ar.reason, ar.status, ar.decision_note, ar.created_at, ar.decided_at,
                 u.name AS decided_by_name
          FROM approval_requests ar
          LEFT JOIN users u ON u.id=ar.decided_by
          WHERE ar.service_request_id=?1
          ORDER BY ar.created_at DESC
          LIMIT 1
        `).bind(requestId).first(),
        env.DB.prepare(`
          SELECT al.action, al.metadata_json, al.created_at, u.name AS actor_name
          FROM audit_logs al
          LEFT JOIN users u ON u.id=al.actor_user_id
          WHERE al.entity_type='service_request'
            AND al.entity_id=?1
          ORDER BY al.created_at ASC, al.id ASC
        `).bind(requestId).all()
      ]);

      return json({request:detail,lines:lines.results,approval:approval || null,timeline:timeline.results});
    }

    if (url.pathname.match(/^\/api\/stays\/[^/]+$/) && request.method === "DELETE") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });
      if (actor.role !== "admin") return json({ error:"forbidden" }, { status:403 });

      const stayId = url.pathname.split("/")[3] || "";
      const existing = await env.DB.prepare(`
        SELECT s.id, s.room_id, s.guest_name, s.guest_phone, s.status,
               s.checkin_at, s.expected_checkout_at, s.actual_checkout_at,
               r.number AS room_number
        FROM stays s
        JOIN rooms r ON r.id = s.room_id
        WHERE s.id = ?1
        LIMIT 1
      `).bind(stayId).first<{
        id:string; room_id:string; guest_name:string; guest_phone:string|null;
        status:string; checkin_at:string; expected_checkout_at:string;
        actual_checkout_at:string|null; room_number:string;
      }>();

      if (!existing) return json({ error:"stay_not_found" }, { status:404 });

      const requestCount = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM service_requests WHERE stay_id = ?1"
      ).bind(stayId).first<{count:number}>();

      await env.DB.batch([
        env.DB.prepare(`
          DELETE FROM approval_requests
          WHERE service_request_id IN (
            SELECT id FROM service_requests WHERE stay_id = ?1
          )
        `).bind(stayId),
        env.DB.prepare("DELETE FROM service_requests WHERE stay_id = ?1").bind(stayId),
        env.DB.prepare("DELETE FROM stay_extensions WHERE stay_id = ?1").bind(stayId),
        ...(existing.status === "in_house"
          ? [env.DB.prepare(`
              UPDATE rooms
              SET operational_status = 'available', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?1
            `).bind(existing.room_id)]
          : []),
        env.DB.prepare("DELETE FROM stays WHERE id = ?1").bind(stayId)
      ]);

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'stay_deleted', 'stay', ?2, ?3)
      `).bind(actor.id, stayId, JSON.stringify({
        guestName: existing.guest_name,
        guestPhone: existing.guest_phone,
        roomNumber: existing.room_number,
        previousStatus: existing.status,
        checkinAt: existing.checkin_at,
        expectedCheckoutAt: existing.expected_checkout_at,
        actualCheckoutAt: existing.actual_checkout_at,
        deletedRequests: Number(requestCount?.count || 0),
        permanent: true
      })).run();

      return json({
        ok:true,
        deletedId:stayId,
        roomReleased:existing.status === "in_house",
        deletedRequests:Number(requestCount?.count || 0)
      });
    }

    if (url.pathname.match(/^\/api\/stays\/[^/]+$/) && request.method === "PATCH") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const stayId = url.pathname.split("/")[3] || "";
      const current = await env.DB.prepare(`
        SELECT id, guest_name, guest_phone, status, checkin_at, expected_checkout_at, actual_checkout_at
        FROM stays
        WHERE id=?1
        LIMIT 1
      `).bind(stayId).first<{
        id:string; guest_name:string; guest_phone:string|null; status:string;
        checkin_at:string; expected_checkout_at:string; actual_checkout_at:string|null;
      }>();

      if (!current) return json({ error:"stay_not_found" }, { status:404 });

      const body = await readJson<{
        guestName?:string;
        guestPhone?:string|null;
        checkinAt?:string;
        expectedCheckoutAt?:string;
        actualCheckoutAt?:string|null;
      }>(request);

      const guestName = body?.guestName?.trim() || "";
      const guestPhone = body?.guestPhone?.trim() || null;
      const checkin = new Date(body?.checkinAt || "");
      const expected = new Date(body?.expectedCheckoutAt || "");
      const actualRaw = body?.actualCheckoutAt?.trim() || "";
      const actual = actualRaw ? new Date(actualRaw) : null;

      if (!guestName) return json({ error:"invalid_guest_name" }, { status:400 });
      if (!Number.isFinite(checkin.getTime())) return json({ error:"invalid_checkin_time" }, { status:400 });
      if (!Number.isFinite(expected.getTime())) return json({ error:"invalid_checkout_time" }, { status:400 });
      if (expected.getTime() <= checkin.getTime()) return json({ error:"checkout_before_checkin" }, { status:400 });
      if (actual && !Number.isFinite(actual.getTime())) return json({ error:"invalid_actual_checkout_time" }, { status:400 });
      if (actual && actual.getTime() < checkin.getTime()) return json({ error:"actual_checkout_before_checkin" }, { status:400 });
      if (current.status === "in_house" && actual) return json({ error:"active_stay_cannot_have_actual_checkout" }, { status:409 });
      if (current.status === "checked_out" && !actual) return json({ error:"checked_out_requires_actual_checkout" }, { status:400 });

      const nextActual = current.status === "checked_out" ? actual!.toISOString() : null;

      await env.DB.prepare(`
        UPDATE stays
        SET guest_name=?1,
            guest_phone=?2,
            checkin_at=?3,
            expected_checkout_at=?4,
            actual_checkout_at=?5,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?6
      `).bind(
        guestName,
        guestPhone,
        checkin.toISOString(),
        expected.toISOString(),
        nextActual,
        stayId
      ).run();

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'stay_corrected', 'stay', ?2, ?3)
      `).bind(actor.id, stayId, JSON.stringify({
        before:{
          guestName:current.guest_name,
          guestPhone:current.guest_phone,
          checkinAt:current.checkin_at,
          expectedCheckoutAt:current.expected_checkout_at,
          actualCheckoutAt:current.actual_checkout_at
        },
        after:{
          guestName,
          guestPhone,
          checkinAt:checkin.toISOString(),
          expectedCheckoutAt:expected.toISOString(),
          actualCheckoutAt:nextActual
        }
      })).run();

      return json({
        ok:true,
        stay:{
          id:stayId,
          guest_name:guestName,
          guest_phone:guestPhone,
          checkin_at:checkin.toISOString(),
          expected_checkout_at:expected.toISOString(),
          actual_checkout_at:nextActual
        }
      });
    }

    if (url.pathname.match(/^\/api\/stays\/[^/]+$/) && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const stayId = url.pathname.split("/")[3] || "";
      const stay = await env.DB.prepare(`
        SELECT
          s.id,s.guest_name,s.guest_phone,s.status,s.checkin_at,s.expected_checkout_at,s.actual_checkout_at,
          r.number AS room_number,r.room_type,
          u.name AS created_by_name
        FROM stays s
        JOIN rooms r ON r.id=s.room_id
        LEFT JOIN users u ON u.id=s.created_by
        WHERE s.id=?1
        LIMIT 1
      `).bind(stayId).first();

      if (!stay) return json({ error:"stay_not_found" }, { status:404 });

      const [extensions, requests] = await Promise.all([
        env.DB.prepare(`
          SELECT se.previous_checkout_at,se.new_checkout_at,se.reason,se.created_at,u.name AS changed_by_name
          FROM stay_extensions se
          LEFT JOIN users u ON u.id=se.changed_by
          WHERE se.stay_id=?1
          ORDER BY se.created_at DESC
        `).bind(stayId).all(),
        env.DB.prepare(`
          SELECT sr.id,sr.status,sr.requested_at,sr.delivered_at,sr.note,
                 GROUP_CONCAT(ri.name || ' × ' || srl.quantity, '، ') AS items
          FROM service_requests sr
          LEFT JOIN service_request_lines srl ON srl.request_id=sr.id
          LEFT JOIN request_items ri ON ri.id=srl.item_id
          WHERE sr.stay_id=?1
          GROUP BY sr.id
          ORDER BY sr.requested_at DESC
        `).bind(stayId).all()
      ]);

      return json({stay,extensions:extensions.results,requests:requests.results});
    }

    if (url.pathname === "/api/requests" && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const scope = url.searchParams.get("scope") || "active";
      const roomNumber = url.searchParams.get("room")?.trim() || "";
      const statusFilter =
        scope === "all" ? "" :
        scope === "completed" ? "AND sr.status IN ('delivered','cancelled')" :
        "AND sr.status NOT IN ('delivered','cancelled')";
      const roomFilter = roomNumber ? "AND r.number = ?1" : "";

      const sql = `
        SELECT
          sr.id,
          sr.stay_id,
          sr.room_id,
          sr.status,
          sr.priority,
          sr.business_day,
          CASE
            WHEN instr(sr.requested_at, 'T') > 0 THEN sr.requested_at
            ELSE replace(sr.requested_at, ' ', 'T') || 'Z'
          END AS requested_at,
          CASE
            WHEN sr.delivered_at IS NULL THEN NULL
            WHEN instr(sr.delivered_at, 'T') > 0 THEN sr.delivered_at
            ELSE replace(sr.delivered_at, ' ', 'T') || 'Z'
          END AS delivered_at,
          r.number AS room_number,
          s.guest_name,
          s.guest_phone,
          sr.note,
          GROUP_CONCAT(ri.name || ' × ' || srl.quantity, '، ') AS items,
          MAX(ar.reason) AS approval_reason
        FROM service_requests sr
        JOIN rooms r ON r.id = sr.room_id
        JOIN stays s ON s.id = sr.stay_id
        LEFT JOIN service_request_lines srl ON srl.request_id = sr.id
        LEFT JOIN request_items ri ON ri.id = srl.item_id
        LEFT JOIN approval_requests ar ON ar.service_request_id = sr.id
        WHERE 1=1
          ${statusFilter}
          ${roomFilter}
        GROUP BY sr.id
        ORDER BY sr.requested_at DESC
        LIMIT 250
      `;

      const stmt = env.DB.prepare(sql);
      const result = roomNumber ? await stmt.bind(roomNumber).all() : await stmt.all();
      return json(result.results);
    }

    if (url.pathname === "/api/requests" && request.method === "POST") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const body = await readJson<{
        stayId?:string;
        lines?:Array<{ itemId?:string; quantity?:number; customLabel?:string }>;
        note?:string;
      }>(request);

      const stayId = body?.stayId?.trim();
      const merged = new Map<string, number>();
      for (const raw of body?.lines || []) {
        let itemId = raw.itemId?.trim() || "";
        const quantity = Number(raw.quantity || 0);
        if (!itemId || !Number.isInteger(quantity) || quantity <= 0) continue;

        if (itemId === "__custom__") {
          const label = raw.customLabel?.trim().replace(/\s+/g," ") || "";
          if (label.length < 2 || label.length > 80) return json({ error:"invalid_custom_item" }, { status:400 });
          const existing = await env.DB.prepare(`
            SELECT id FROM request_items WHERE lower(name)=lower(?1) LIMIT 1
          `).bind(label).first<{id:string}>();
          if (existing?.id) {
            itemId = existing.id;
          } else {
            const customId = "custom-" + (await sha256Hex(label.toLowerCase())).slice(0,16);
            await env.DB.prepare(`
              INSERT OR IGNORE INTO request_items
                (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active)
              VALUES (?1,?2,'قطعة',NULL,NULL,NULL,0)
            `).bind(customId,label).run();
            itemId = customId;
          }
        }

        merged.set(itemId, (merged.get(itemId) || 0) + quantity);
      }
      const lines = Array.from(merged, ([itemId, quantity]) => ({ itemId, quantity }));

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
          WHERE id = ?1 AND (active = 1 OR id LIKE 'custom-%')
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
      const updated = await env.DB.prepare(`
        UPDATE service_requests
        SET status = ?1,
            acknowledged_by = CASE WHEN ?1 IN ('acknowledged','preparing') AND acknowledged_by IS NULL THEN ?2 ELSE acknowledged_by END,
            delivered_by = CASE WHEN ?1 = 'delivered' THEN ?2 ELSE delivered_by END,
            delivered_at = CASE WHEN ?1 = 'delivered' THEN ?3 ELSE delivered_at END
        WHERE id = ?4 AND status = ?5
      `).bind(next,actor.id,deliveredAt,requestId,current.status).run();

      if (!updated.meta.changes) {
        return json({ error:"request_state_changed" }, { status:409 });
      }

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'service_request_status_changed', 'service_request', ?2, ?3)
      `).bind(actor.id,requestId,JSON.stringify({from:current.status,to:next})).run();

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

      const decided = await env.DB.prepare(`
        UPDATE approval_requests
        SET status = ?1, decided_by = ?2, decision_note = ?3, decided_at = ?4
        WHERE id = ?5 AND status = 'pending'
      `).bind(body.decision,actor.id,body.note?.trim() || null,now,approval.id).run();

      if (!decided.meta.changes) {
        return json({ error:"approval_already_decided" }, { status:409 });
      }

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE service_requests SET status = ?1 WHERE id = ?2 AND status = 'approval_required'
        `).bind(requestStatus,requestId),
        env.DB.prepare(`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
          VALUES (?1, 'service_request_decision', 'service_request', ?2, ?3)
        `).bind(actor.id,requestId,JSON.stringify({decision:body.decision}))
      ]);

      return json({ok:true,status:requestStatus});
    }

    if (url.pathname.match(/^\/api\/requests\/[^/]+$/) && request.method === "DELETE") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });
      if (actor.role !== "admin") return json({ error:"forbidden" }, { status:403 });

      const requestId = url.pathname.split("/")[3] || "";
      const existing = await env.DB.prepare(`
        SELECT sr.id, sr.status, sr.business_day, sr.requested_at,
               r.number AS room_number, s.guest_name
        FROM service_requests sr
        JOIN rooms r ON r.id = sr.room_id
        JOIN stays s ON s.id = sr.stay_id
        WHERE sr.id = ?1
        LIMIT 1
      `).bind(requestId).first<{
        id:string; status:string; business_day:string; requested_at:string;
        room_number:string; guest_name:string;
      }>();

      if (!existing) return json({ error:"request_not_found" }, { status:404 });

      await env.DB.batch([
        env.DB.prepare("DELETE FROM approval_requests WHERE service_request_id = ?1").bind(requestId),
        env.DB.prepare("DELETE FROM service_requests WHERE id = ?1").bind(requestId)
      ]);

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1, 'service_request_deleted', 'service_request', ?2, ?3)
      `).bind(actor.id, requestId, JSON.stringify({
        roomNumber: existing.room_number,
        guestName: existing.guest_name,
        previousStatus: existing.status,
        businessDay: existing.business_day,
        requestedAt: existing.requested_at,
        permanent: true
      })).run();

      return json({ ok:true, deletedId:requestId });
    }

    if (url.pathname === "/api/stays" && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const result = await env.DB.prepare(`
        SELECT
          s.id,
          s.guest_name,
          s.guest_phone,
          s.status,
          s.checkin_at,
          s.expected_checkout_at,
          s.actual_checkout_at,
          (
            SELECT GROUP_CONCAT(se.previous_checkout_at, '|')
            FROM stay_extensions se
            WHERE se.stay_id = s.id
          ) AS extension_previous_checkouts,
          r.number AS room_number,
          r.room_type,
          COUNT(sr.id) AS total_requests,
          SUM(CASE WHEN sr.status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS open_requests
        FROM stays s
        JOIN rooms r ON r.id = s.room_id
        LEFT JOIN service_requests sr ON sr.stay_id = s.id
        GROUP BY s.id
        ORDER BY s.checkin_at DESC
        LIMIT 500
      `).all();

      return json(result.results);
    }

    if (url.pathname === "/api/reports/summary" && request.method === "GET") {
      const actor = await requireSession(request, env);
      if (!actor) return json({ error:"unauthorized" }, { status:401 });

      const businessDay = await hotelBusinessDay(env);
      const [roomStats, stayStats, requestStats, topItems] = await Promise.all([
        env.DB.prepare(`
          SELECT
            COUNT(*) AS total_rooms,
            SUM(CASE WHEN operational_status='available' THEN 1 ELSE 0 END) AS available_rooms,
            SUM(CASE WHEN operational_status='occupied' THEN 1 ELSE 0 END) AS occupied_rooms
          FROM rooms
        `).first(),
        env.DB.prepare(`
          SELECT
            SUM(CASE WHEN status='in_house' THEN 1 ELSE 0 END) AS in_house,
            SUM(CASE WHEN status='checked_out' THEN 1 ELSE 0 END) AS checked_out_total,
            SUM(CASE WHEN substr(checkin_at,1,10)=?1 THEN 1 ELSE 0 END) AS checkins_today,
            SUM(CASE WHEN actual_checkout_at IS NOT NULL AND substr(actual_checkout_at,1,10)=?1 THEN 1 ELSE 0 END) AS checkouts_today
          FROM stays
        `).bind(businessDay).first(),
        env.DB.prepare(`
          SELECT
            COUNT(*) AS total_requests,
            SUM(CASE WHEN business_day=?1 THEN 1 ELSE 0 END) AS requests_today,
            SUM(CASE WHEN status='approval_required' THEN 1 ELSE 0 END) AS awaiting_approval,
            SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS active_requests,
            AVG(CASE WHEN delivered_at IS NOT NULL THEN
              (julianday(delivered_at)-julianday(requested_at))*24*60
            END) AS avg_delivery_minutes
          FROM service_requests
        `).bind(businessDay).first(),
        env.DB.prepare(`
          SELECT ri.name, SUM(srl.quantity) AS quantity
          FROM service_request_lines srl
          JOIN request_items ri ON ri.id=srl.item_id
          JOIN service_requests sr ON sr.id=srl.request_id
          WHERE sr.status!='cancelled'
          GROUP BY ri.id
          ORDER BY quantity DESC
          LIMIT 8
        `).all()
      ]);

      return json({
        businessDay,
        roomStats,
        stayStats,
        requestStats,
        topItems: topItems.results
      });
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
      const body = await readJson<{
        name?:string;
        username?:string;
        password?:string;
        role?:"admin"|"reception";
        active?:boolean;
      }>(request);
      if (!userId) return json({ error:"invalid_user_payload" }, { status:400 });

      const current = await env.DB.prepare(`
        SELECT id,name,username,role,active FROM users WHERE id=?1 LIMIT 1
      `).bind(userId).first<{id:string;name:string;username:string;role:"admin"|"reception";active:number}>();
      if(!current) return json({ error:"user_not_found" }, { status:404 });

      const name = body?.name === undefined ? current.name : body.name.trim();
      const username = body?.username === undefined ? current.username : body.username.trim().toLowerCase();
      const role = body?.role === undefined ? current.role : (body.role === "admin" ? "admin" : "reception");
      const active = typeof body?.active === "boolean" ? body.active : Boolean(current.active);
      const password = body?.password || "";

      if(!name || !username || (password && password.length < 10)){
        return json({ error:"invalid_user_payload" }, { status:400 });
      }
      if(userId===actor.id && !active) return json({ error:"cannot_disable_self" }, { status:409 });
      if(userId===actor.id && role!=="admin") return json({ error:"cannot_demote_self" }, { status:409 });

      if(username!==current.username){
        const existing=await env.DB.prepare("SELECT id FROM users WHERE username=?1 AND id<>?2 LIMIT 1").bind(username,userId).first();
        if(existing) return json({ error:"username_exists" }, { status:409 });
      }

      const passwordHash=password ? await hashPassword(password) : null;
      const updated=await env.DB.prepare(`
        UPDATE users
        SET name=?1,
            username=?2,
            role=?3,
            active=?4,
            password_hash=CASE WHEN ?5 IS NULL THEN password_hash ELSE ?5 END,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?6
      `).bind(name,username,role,active?1:0,passwordHash,userId).run();

      if(!updated.meta.changes) return json({ error:"user_not_found" }, { status:404 });

      await env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES (?1,'user_updated','user',?2,?3)
      `).bind(actor.id,userId,JSON.stringify({
        before:{name:current.name,username:current.username,role:current.role,active:Boolean(current.active)},
        after:{name,username,role,active},
        passwordChanged:Boolean(password)
      })).run();

      return json({ok:true,user:{id:userId,name,username,role,active:active?1:0}});
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
              AND sr.stay_id = s.id
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
