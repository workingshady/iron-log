// API client + offline outbox + event (click) logger.
// Writes go through the outbox: saved to localStorage first, sent when online, retried until they land.
// IDs are generated on the phone, so retries never create duplicates.

export const uid = () => crypto.randomUUID();

export class Unauthorized extends Error {}

export async function get<T>(url: string): Promise<T> {
  const r = await fetch(`/api${url}`, { credentials: "same-origin" });
  if (r.status === 401) throw new Unauthorized();
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? r.statusText);
  return r.json();
}

export async function send<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) throw new Unauthorized();
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? r.statusText);
  return r.json();
}

// ---------------------------------------------------------------- outbox

type Job = { k: string; method: string; url: string; body?: unknown; tries: number };
const OUTBOX = "il_outbox";
const listeners = new Set<(n: number) => void>();

function load(): Job[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]");
  } catch {
    return [];
  }
}
function save(q: Job[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(q));
  } catch {
    /* storage full / private mode: nothing we can do */
  }
  listeners.forEach((f) => f(q.length));
}

export function onPending(f: (n: number) => void) {
  listeners.add(f);
  f(load().length);
  return () => void listeners.delete(f);
}

/** Queue a write. Same key → PUT replaces, PATCH merges (only the latest state is sent). */
export function queue(method: string, url: string, body?: unknown, key = `${method} ${url}`) {
  const q = load();
  const i = q.findIndex((j) => j.k === key);
  if (i >= 0 && method === "PATCH") q[i].body = { ...(q[i].body as object), ...(body as object) };
  else if (i >= 0) q[i] = { ...q[i], body };
  else q.push({ k: key, method, url, body, tries: 0 });
  save(q);
  void flush();
}

let flushing = false;
export async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (;;) {
      const q = load();
      if (!q.length) break;
      const job = q[0];
      try {
        await send(job.method, job.url, job.body);
        save(load().filter((j) => j !== undefined && j.k !== job.k));
      } catch (e) {
        if (e instanceof Unauthorized || e instanceof TypeError) break; // offline or logged out: retry later
        job.tries++;
        if (job.tries >= 5) {
          console.error("Dropping failed write", job, e);
          save(load().filter((j) => j.k !== job.k));
        } else {
          save([job, ...load().slice(1)]);
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  setInterval(() => void flush(), 15000);
}

// ---------------------------------------------------------------- events

let buf: { id: string; sessionId?: string; type: string; data?: unknown; at: number }[] = [];

/** Log an interaction. Cheap: buffered and sent in batches. */
export function track(type: string, data?: unknown, sessionId?: string) {
  buf.push({ id: uid(), sessionId, type, data, at: Date.now() });
  if (buf.length >= 10) flushEvents();
}
export function flushEvents() {
  if (!buf.length) return;
  const batch = buf;
  buf = [];
  queue("POST", "/events", batch, `events ${batch[0].id}`);
}
if (typeof window !== "undefined") {
  setInterval(flushEvents, 5000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushEvents());
}

// ---------------------------------------------------------------- small cache (works offline mid-session)

export const cache = {
  get<T>(k: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(`il_c_${k}`) ?? "null");
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`il_c_${k}`, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};
