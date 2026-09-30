export interface Env { DB: D1Database; }

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", ...cors, ...(init.headers || {}) }
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS rooms FROM rooms").first<{ rooms: number }>();
      return json({ ok: true, service: "roomora-api", database: "connected", rooms: row?.rooms ?? 0 });
    }

    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
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
        rooms: rooms.results,
        settings,
        requestItems: items.results,
        shifts: shifts.results
      });
    }

    if (url.pathname === "/api/rooms" && request.method === "GET") {
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
