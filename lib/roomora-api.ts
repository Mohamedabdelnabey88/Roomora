// workers.dev applies Browser Integrity Check to server clients too. Identify
// Roomora explicitly instead of relying on the runtime's default User-Agent.
export const ROOMORA_USER_AGENT = "Roomora/1.0 (+https://roomora-lac.vercel.app)";

export function fetchRoomoraApi(input: string | URL | Request, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("user-agent", ROOMORA_USER_AGENT);
  headers.set("accept", "application/json");
  return fetcher(input, { ...init, headers });
}

// Hotel data stays in the authenticated application cache, never the public CDN.
export function roomoraResponseHeaders(response: Response): Record<string,string> {
  const headers: Record<string,string> = { "cache-control": "private, no-store" };
  const state=response.headers.get("x-roomora-cache");
  if(state==="HIT"||state==="MISS")headers["x-roomora-cache"]=state;
  return headers;
}
