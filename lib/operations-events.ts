export const OPERATIONS_CHANGED_EVENT = "roomora:operations-changed";
const reads = new Map<string, Promise<Response>>();
let generation = 0;
let quotaPauseUntil = 0;
let quotaError = "d1_read_limit_exceeded";

export function invalidateOperationsRequests() {
  generation++;
  reads.clear();
  quotaPauseUntil = 0;
}

// Coalesce concurrent GETs only. Successful hotel data is never cached here.
export async function fetchOperations(input: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  if ((init.method || "GET").toUpperCase() !== "GET") {
    invalidateOperationsRequests();
    try { return await fetcher(input, init); }
    finally { invalidateOperationsRequests(); }
  }
  if (init.signal) return fetcher(input, init);
  if (Date.now() < quotaPauseUntil) {
    return Response.json({ error: quotaError }, { status: 503, headers: { "retry-after": "60" } });
  }
  const key = JSON.stringify([input, init.credentials || "same-origin", Array.from(new Headers(init.headers).entries())]);
  let pending = reads.get(key);
  if (!pending) {
    const requestGeneration = generation;
    pending = fetcher(input, init).then(async response => {
      if (response.status === 503) {
        const payload = await response.clone().json().catch(() => null);
        if (requestGeneration === generation && ["d1_read_limit_exceeded", "d1_write_limit_exceeded"].includes(payload?.error)) {
          quotaError = payload.error;
          quotaPauseUntil = Date.now() + 60000;
        }
      }
      return response;
    });
    reads.set(key, pending);
    const clear = () => { if (reads.get(key) === pending) reads.delete(key); };
    void pending.then(clear, clear);
  }
  return (await pending).clone();
}

export function notifyOperationsChanged() {
  invalidateOperationsRequests();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATIONS_CHANGED_EVENT));
  try { localStorage.setItem("roomora:operations-version", String(Date.now())); } catch {}
}

// Page-owned lifecycle: no background reads, no overlapping refreshes, and one
// refresh for a burst of focus/pageshow/visibility events. Mutations refresh now.
export function startOperationsRefresh(callback: () => void | Promise<unknown>, { intervalMs = 60000, minGapMs = 5000 } = {}) {
  if (typeof window === "undefined") return () => {};
  let active = true;
  let running = false;
  let pendingMutation = false;
  let dirty = false;
  let lastStarted = Date.now();
  const refresh = async (mutation = false) => {
    if (!active) return;
    if (document.visibilityState !== "visible") { dirty = true; return; }
    if (running) { pendingMutation ||= mutation; return; }
    if (!mutation && Date.now() - lastStarted < minGapMs) return;
    running = true;
    dirty = false;
    lastStarted = Date.now();
    try { await callback(); } catch { /* Page loaders render their own errors. */ }
    finally {
      running = false;
      if (pendingMutation && active) { pendingMutation = false; void refresh(true); }
    }
  };
  const onMutation = () => { void refresh(true); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === "roomora:operations-version") { invalidateOperationsRequests(); onMutation(); }
  };
  const onForeground = () => { void refresh(dirty); };
  const timer = intervalMs > 0 ? window.setInterval(() => { void refresh(); }, intervalMs) : null;
  window.addEventListener(OPERATIONS_CHANGED_EVENT, onMutation);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onForeground);
  window.addEventListener("pageshow", onForeground);
  document.addEventListener("visibilitychange", onForeground);
  return () => {
    if (!active) return;
    active = false;
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener(OPERATIONS_CHANGED_EVENT, onMutation);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onForeground);
    window.removeEventListener("pageshow", onForeground);
    document.removeEventListener("visibilitychange", onForeground);
  };
}

export function subscribeOperationsChanged(callback: () => void | Promise<unknown>) {
  return startOperationsRefresh(callback, { intervalMs: 0 });
}
