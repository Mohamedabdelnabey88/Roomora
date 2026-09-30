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
    if (url.pathname === "/health") return json({ ok: true, service: "roomora-api" });
    if (url.pathname === "/api/rooms" && request.method === "GET") {
      const result = await env.DB.prepare(`
        SELECT r.*, s.id AS stay_id, s.guest_name, s.expected_checkout_at
        FROM rooms r
        LEFT JOIN stays s ON s.room_id = r.id AND s.status = 'in_house'
        ORDER BY r.floor, r.number
      `).all();
      return json(result.results);
    }
    return json({ error: "not_found" }, { status: 404 });
  }
};
