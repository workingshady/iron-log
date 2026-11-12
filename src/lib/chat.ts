import { useEffect, useSyncExternalStore } from "react";
import { cache, isDev, Unauthorized, uid } from "./api";

// Chat client: one store per conversation + the chat list + the unread badge.
//
//   • D1 (HTTP) is the source of truth. WebSockets (one per open room + one "inbox" per user) only push events.
//   • Rooms open instantly from a local cache, then sync the latest page from the server (also after every reconnect).
//   • Live connection: exponential backoff with jitter (1 s → 30 s), "ping"/"pong" heartbeat every 25 s (answered by the
//     Durable Object runtime without waking it), reconnect on "online" / tab visible. While the socket is down the room
//     polls every 5 s, so chat keeps working even where WebSockets are blocked.
//   • Sends are optimistic: the bubble appears at once (clock icon), an outbox retries until the server stores it
//     (client-generated id → retries never duplicate), and a send the server refuses is marked failed with Retry.
//     Text + sticker sends survive an app restart (localStorage); photo / voice uploads are kept in memory only.
//   • Every incoming message is de-duplicated by id.

// ---------------------------------------------------------------- types (mirror worker/routes/chat.ts)

export interface ChatUser { id: string; username: string; name: string | null; avatarId: string | null; lastSeenAt: number | null; lastReadAt?: number | null }
export interface MediaInfo { w: number | null; h: number | null; mime: string; durationMs: number | null }
export interface Msg {
  id: string; convId: string; senderId: string; kind: "text" | "image" | "voice" | "sticker" | "system" | string;
  text: string | null; mediaId: string | null; sticker: string | null; replyToId: string | null;
  createdAt: number; editedAt: number | null; deleted: number;
  reactions: Record<string, string[]>;
  media?: MediaInfo | null;
  reply?: { id: string; senderId: string; kind: string; text: string | null; deleted: number } | null;
  /** local only */
  status?: "pending" | "failed";
  error?: string;
  local?: { previewUrl?: string; blobUrl?: string; peaks?: number[] };
}
export interface ChatTheme { accent?: string; bubble?: string; wallpaper?: string }
export interface Conv {
  id: string; kind: "dm" | "group" | string; title: string | null; theme: ChatTheme | null; createdBy: string; createdAt: number;
  lastMessageAt: number; muted: number; myLastReadAt: number | null; unread: number; members: ChatUser[];
  last: { id: string; senderId: string; kind: string; text: string | null; sticker: string | null; deleted: number; createdAt: number } | null;
}
export type LiveState = "live" | "connecting" | "polling" | "offline";

export interface Room {
  id: string;
  conv: Conv | null;
  msgs: Msg[];
  hasMore: boolean;
  loaded: boolean;
  loadingOlder: boolean;
  online: string[];
  typing: Record<string, number>; // userId → expires at
  live: LiveState;
  error: string | null;
}

// ---------------------------------------------------------------- tiny fetch (no global "data changed" event: chat is chatty)

export class HttpError extends Error { constructor(msg: string, public status: number) { super(msg); } }
async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, { method, credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) throw new Unauthorized();
  if (!r.ok) throw new HttpError(((await r.json().catch(() => ({}))) as { error?: string })?.error ?? r.statusText, r.status);
  return r.json() as Promise<T>;
}
export const chatApi = call;

// ---------------------------------------------------------------- live socket with reconnect + heartbeat

class Live {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private hb: ReturnType<typeof setInterval> | undefined;
  private pongAt = 0;
  private stopped = false;
  state: LiveState = "connecting";
  constructor(private path: string, private onEvent: (e: Record<string, unknown>) => void, private onState: (s: LiveState, reopened: boolean) => void) {
    window.addEventListener("online", this.now);
    window.addEventListener("offline", this.off);
    document.addEventListener("visibilitychange", this.vis);
    this.connect();
  }
  private set(s: LiveState, reopened = false) { this.state = s; this.onState(s, reopened); }
  private now = () => { if (this.stopped) return; if (this.ws?.readyState !== WebSocket.OPEN && this.ws?.readyState !== WebSocket.CONNECTING) { clearTimeout(this.retry); this.attempts = 0; this.connect(); } };
  private off = () => { this.set("offline"); this.ws?.close(); };
  private vis = () => { if (document.visibilityState === "visible") { this.now(); this.ping(); } };
  private connect() {
    if (this.stopped) return;
    if (!navigator.onLine) { this.set("offline"); return; }
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api${this.path}`);
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      const reopened = this.attempts > 0 || this.state !== "connecting";
      this.attempts = 0;
      this.pongAt = Date.now();
      clearInterval(this.hb);
      this.hb = setInterval(() => this.ping(), 25_000);
      this.set("live", reopened);
    };
    ws.onmessage = (e) => {
      if (e.data === "pong") { this.pongAt = Date.now(); return; }
      try { this.onEvent(JSON.parse(String(e.data))); } catch { /* ignore junk */ }
    };
    ws.onclose = () => {
      clearInterval(this.hb);
      if (this.ws !== ws || this.stopped) return;
      this.ws = null;
      if (!navigator.onLine) { this.set("offline"); return; }
      this.attempts++;
      this.set(this.attempts >= 2 || !opened ? "polling" : "connecting");
      const base = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts - 1, 5));
      this.retry = setTimeout(() => this.connect(), base * (0.5 + Math.random() / 2));
    };
  }
  /** Heartbeat: send "ping"; no "pong" within 10 s → the connection is dead (NAT timeout, sleep) → reconnect. */
  private ping() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const sent = Date.now();
    try { ws.send("ping"); } catch { /* closing */ }
    setTimeout(() => { if (this.ws === ws && this.pongAt < sent) ws.close(); }, 10_000);
  }
  send(o: unknown) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.hb);
    window.removeEventListener("online", this.now);
    window.removeEventListener("offline", this.off);
    document.removeEventListener("visibilitychange", this.vis);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }
}

// ---------------------------------------------------------------- stores

let myId = "";
try { myId = (JSON.parse(localStorage.getItem("il:me") ?? "null") as { id?: string } | null)?.id ?? ""; } catch { /* ignore */ }
export const setChatMe = (id: string | undefined | null) => { if (id) myId = id; };
export const chatMe = () => myId;

const rooms = new Map<string, Room>();
const roomSubs = new Map<string, Set<() => void>>();
const blank = (id: string): Room => ({ id, conv: null, msgs: [], hasMore: true, loaded: false, loadingOlder: false, online: [], typing: {}, live: "connecting", error: null });

function getRoom(id: string): Room {
  let r = rooms.get(id);
  if (!r) {
    const c = cache.get<{ conv: Conv | null; msgs: Msg[] }>(`chat:${id}`);
    r = { ...blank(id), ...(c ? { conv: c.conv, msgs: c.msgs } : {}) };
    r = { ...r, msgs: withOutbox(id, r.msgs) };
    rooms.set(id, r);
  }
  return r;
}
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function setRoom(id: string, f: (r: Room) => Partial<Room>) {
  const cur = getRoom(id);
  const next = { ...cur, ...f(cur) };
  rooms.set(id, next);
  roomSubs.get(id)?.forEach((s) => s());
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(() => {
    const r = rooms.get(id);
    if (r?.loaded) cache.set(`chat:${id}`, { conv: r.conv, msgs: r.msgs.filter((m) => !m.status && !m.local).slice(-80) });
  }, 600));
}

const ord = (m: Msg) => (m.status ? Number.MAX_SAFE_INTEGER - 1e9 + m.createdAt / 1e4 : m.createdAt);
function sortMsgs(a: Msg[]) {
  return a.sort((x, y) => ord(x) - ord(y) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
/** Merge server messages into the list (dedupe by id; server wins, local previews are kept). */
function merge(list: Msg[], incoming: Msg[]): Msg[] {
  if (!incoming.length) return list;
  const by = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) {
    const old = by.get(m.id);
    by.set(m.id, old?.local ? { ...m, local: old.local } : m);
  }
  return sortMsgs([...by.values()]);
}

// ---------------------------------------------------------------- outbox

type Job = { id: string; convId: string; body: { id: string; kind: string; text?: string | null; sticker?: string | null; mediaId?: string | null; replyToId?: string | null }; tries: number; state: "pending" | "failed"; error?: string; optimistic: Msg; upload?: { kind: "image" | "voice"; dataUrl: string; thumbUrl?: string; w?: number; h?: number; durationMs?: number; done?: boolean } };
const OUT_KEY = () => (isDev() ? "il_chat_outbox_dev" : "il_chat_outbox");
let jobs: Job[] = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(OUT_KEY()) ?? "[]") as Job[];
    return saved.filter((j) => !j.upload);
  } catch { return []; }
})();
function saveJobs() {
  try { localStorage.setItem(OUT_KEY(), JSON.stringify(jobs.filter((j) => !j.upload).map((j) => ({ ...j, optimistic: { ...j.optimistic, local: undefined } })))); } catch { /* full */ }
}
function withOutbox(convId: string, msgs: Msg[]) {
  const have = new Set(msgs.map((m) => m.id));
  const extra = jobs.filter((j) => j.convId === convId && !have.has(j.id)).map((j) => ({ ...j.optimistic, status: j.state, error: j.error }));
  return extra.length ? sortMsgs([...msgs, ...extra]) : msgs;
}
function jobToRoom(j: Job) {
  setRoom(j.convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === j.id ? { ...m, status: j.state, error: j.error } : m)) }));
}

let flushing = false;
export async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const j of [...jobs]) {
      if (j.state !== "pending" || !jobs.includes(j)) continue;
      try {
        if (j.upload && !j.upload.done) {
          const u = j.upload;
          await call("POST", `/chat/${j.convId}/media`, { id: j.body.mediaId, kind: u.kind, dataUrl: u.dataUrl, thumbUrl: u.thumbUrl, w: u.w, h: u.h, durationMs: u.durationMs });
          u.done = true;
        }
        const saved = await call<Msg>("POST", `/chat/${j.convId}/messages`, j.body);
        jobs = jobs.filter((x) => x !== j);
        saveJobs();
        setRoom(j.convId, (r) => ({ msgs: merge(r.msgs.filter((m) => m.id !== j.id), [{ ...saved, local: j.optimistic.local }]) }));
        bumpList(saved);
      } catch (e) {
        if (e instanceof Unauthorized || e instanceof TypeError) break; // offline / logged out → later
        const status = e instanceof HttpError ? e.status : 0;
        j.tries++;
        if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || j.tries >= 5) {
          j.state = "failed";
          j.error = (e as Error).message;
        }
        saveJobs();
        jobToRoom(j);
        if (j.state === "pending") break;
      }
    }
  } finally {
    flushing = false;
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushOutbox());
  setInterval(() => jobs.some((j) => j.state === "pending") && void flushOutbox(), 5000);
}

function enqueue(convId: string, body: Job["body"], optimistic: Msg, upload?: Job["upload"]) {
  const j: Job = { id: body.id, convId, body, tries: 0, state: "pending", optimistic, upload };
  jobs.push(j);
  saveJobs();
  setRoom(convId, (r) => ({ msgs: merge(r.msgs, [{ ...optimistic, status: "pending" }]) }));
  void flushOutbox();
}

export function retrySend(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  j.state = "pending"; j.tries = 0; j.error = undefined;
  saveJobs(); jobToRoom(j); void flushOutbox();
}
export function discardSend(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  jobs = jobs.filter((x) => x !== j);
  saveJobs();
  setRoom(j.convId, (r) => ({ msgs: r.msgs.filter((m) => m.id !== id) }));
}

function optimistic(convId: string, p: Partial<Msg>, replyTo?: Msg | null): Msg {
  return {
    id: uid(), convId, senderId: myId, kind: "text", text: null, mediaId: null, sticker: null, replyToId: replyTo?.id ?? null, createdAt: Date.now(),
    editedAt: null, deleted: 0, reactions: {}, media: null, status: "pending",
    reply: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, kind: replyTo.kind, text: replyTo.text, deleted: replyTo.deleted } : null, ...p,
  };
}

export function sendText(convId: string, text: string, replyTo?: Msg | null) {
  const m = optimistic(convId, { kind: "text", text: text.trim() }, replyTo);
  enqueue(convId, { id: m.id, kind: "text", text: m.text, replyToId: m.replyToId }, m);
  live.get(convId)?.send({ t: "typing", on: false });
}
export function sendSticker(convId: string, sticker: string, replyTo?: Msg | null) {
  const m = optimistic(convId, { kind: "sticker", sticker }, replyTo);
  enqueue(convId, { id: m.id, kind: "sticker", sticker, replyToId: m.replyToId }, m);
}

/** Bubble-sized copy that keeps the photo's own shape (the editor's thumbnail is a fixed crop). */
async function bubbleThumb(dataUrl: string, max = 480): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.72, out = c.toDataURL("image/jpeg", q);
  while (out.length > 150_000 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
  return out;
}

export async function sendImage(convId: string, ed: { dataUrl: string; w: number; h: number }, caption: string, replyTo?: Msg | null) {
  const thumbUrl = await bubbleThumb(ed.dataUrl);
  const mediaId = uid();
  const m = optimistic(convId, { kind: "image", text: caption.trim() || null, mediaId, media: { w: ed.w, h: ed.h, mime: "image/jpeg", durationMs: null }, local: { previewUrl: thumbUrl } }, replyTo);
  enqueue(convId, { id: m.id, kind: "image", mediaId, text: m.text, replyToId: m.replyToId }, m, { kind: "image", dataUrl: ed.dataUrl, thumbUrl, w: ed.w, h: ed.h });
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

export async function sendVoice(convId: string, blob: Blob, durationMs: number, peaks: number[], replyTo?: Msg | null) {
  if (blob.size > 1_000_000) throw new Error("Voice note is too large (max 1 MB)");
  let dataUrl = await blobToDataUrl(blob);
  dataUrl = dataUrl.replace(/^data:audio\/([\w-]+)(;codecs=[^;,]+)?;base64,/, (_s, sub: string, codecs?: string) => `data:audio/${sub}${codecs ?? ""};base64,`);
  const mediaId = uid();
  const mime = blob.type.split(";")[0] || "audio/webm";
  const m = optimistic(convId, { kind: "voice", mediaId, media: { w: null, h: null, mime, durationMs }, local: { blobUrl: URL.createObjectURL(blob), peaks } }, replyTo);
  enqueue(convId, { id: m.id, kind: "voice", mediaId, replyToId: m.replyToId }, m, { kind: "voice", dataUrl, durationMs });
}

// ---------------------------------------------------------------- other actions (optimistic, revert on error)

export async function editMessage(convId: string, id: string, text: string) {
  const prev = getRoom(convId).msgs.find((m) => m.id === id);
  setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === id ? { ...m, text, editedAt: Date.now() } : m)) }));
  try { await call("PATCH", `/chat/${convId}/messages/${id}`, { text }); }
  catch (e) { if (prev) setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === id ? prev : m)) })); throw e; }
}
export async function deleteMessage(convId: string, id: string) {
  if (jobs.some((j) => j.id === id)) return discardSend(id);
  const prev = getRoom(convId).msgs.find((m) => m.id === id);
  setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === id ? { ...m, deleted: 1, text: null, sticker: null, mediaId: null, reactions: {} } : m)) }));
  try { await call("DELETE", `/chat/${convId}/messages/${id}`); }
  catch (e) { if (prev) setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === id ? prev : m)) })); throw e; }
}
export async function toggleReaction(convId: string, id: string, emoji: string) {
  const prev = getRoom(convId).msgs.find((m) => m.id === id);
  if (!prev || prev.status) return;
  const mine = prev.reactions[emoji]?.includes(myId);
  const next = { ...prev.reactions };
  next[emoji] = mine ? next[emoji].filter((u) => u !== myId) : [...(next[emoji] ?? []), myId];
  if (!next[emoji].length) delete next[emoji];
  setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === id ? { ...m, reactions: next } : m)) }));
  try {
    const r = await call<{ reactions: Msg["reactions"] }>("POST", `/chat/${convId}/messages/${id}/react`, { emoji, on: !mine });
    setRoom(convId, (s) => ({ msgs: s.msgs.map((m) => (m.id === id ? { ...m, reactions: r.reactions } : m)) }));
  } catch {
    setRoom(convId, (s) => ({ msgs: s.msgs.map((m) => (m.id === id ? { ...m, reactions: prev.reactions } : m)) }));
  }
}

let readTimer: ReturnType<typeof setTimeout> | undefined;
/** Mark everything currently loaded as read (debounced; only moves forward). */
export function markRead(convId: string) {
  clearTimeout(readTimer);
  readTimer = setTimeout(async () => {
    const r = getRoom(convId);
    const last = [...r.msgs].reverse().find((m) => !m.status);
    if (!last || !r.conv) return;
    if ((r.conv.myLastReadAt ?? 0) >= last.createdAt) return;
    const at = last.createdAt;
    setRoom(convId, (s) => (s.conv ? { conv: { ...s.conv, myLastReadAt: at, unread: 0, members: s.conv.members.map((u) => (u.id === myId ? { ...u, lastReadAt: at } : u)) } } : {}));
    setList((l) => ({ convs: l.convs.map((c) => (c.id === convId ? { ...c, unread: 0, myLastReadAt: at } : c)) }));
    try { await call("POST", `/chat/${convId}/read`, { at }); } catch { /* next time */ }
    void refreshUnread();
  }, 400);
}

let typingSent = 0;
export function sendTyping(convId: string, on: boolean) {
  const l = live.get(convId);
  if (!l) return;
  if (on && Date.now() - typingSent < 2500) return;
  typingSent = on ? Date.now() : 0;
  l.send({ t: "typing", on });
}

export async function loadOlder(convId: string) {
  const r = getRoom(convId);
  if (r.loadingOlder || !r.hasMore) return;
  const oldest = r.msgs.find((m) => !m.status);
  if (!oldest) return;
  setRoom(convId, () => ({ loadingOlder: true }));
  try {
    const page = await call<{ messages: Msg[]; hasMore: boolean }>("GET", `/chat/${convId}/messages?before=${oldest.createdAt}:${encodeURIComponent(oldest.id)}&limit=50`);
    setRoom(convId, (s) => ({ msgs: merge(s.msgs, page.messages), hasMore: page.hasMore, loadingOlder: false }));
  } catch {
    setRoom(convId, () => ({ loadingOlder: false }));
  }
}
/** Make sure a (quoted) message is loaded; returns true if it is. */
export async function loadAround(convId: string, id: string) {
  if (getRoom(convId).msgs.some((m) => m.id === id)) return true;
  try {
    const page = await call<{ messages: Msg[]; hasMore: boolean }>("GET", `/chat/${convId}/messages?around=${encodeURIComponent(id)}`);
    setRoom(convId, (s) => ({ msgs: merge(s.msgs, page.messages), hasMore: page.hasMore || s.hasMore }));
    return getRoom(convId).msgs.some((m) => m.id === id);
  } catch { return false; }
}

export async function refreshConv(convId: string) {
  try {
    const conv = await call<Conv>("GET", `/chat/${convId}`);
    setRoom(convId, () => ({ conv, error: null }));
    setList((l) => ({ convs: l.convs.map((c) => (c.id === convId ? conv : c)) }));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) setRoom(convId, () => ({ error: "This chat doesn't exist or you're not in it.", loaded: true }));
  }
}
async function syncLatest(convId: string) {
  try {
    const page = await call<{ messages: Msg[]; hasMore: boolean }>("GET", `/chat/${convId}/messages?limit=50`);
    setRoom(convId, (s) => {
      // anything we had that is newer than the page's oldest but missing from it was deleted server-side? no: tombstones stay. Keep.
      const msgs = merge(s.msgs, page.messages);
      return { msgs: withOutbox(convId, msgs), hasMore: s.loaded ? s.hasMore || page.hasMore : page.hasMore, loaded: true, error: null };
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) setRoom(convId, () => ({ error: "This chat doesn't exist or you're not in it.", loaded: true }));
  }
}

export async function updateConv(convId: string, patch: { title?: string; theme?: ChatTheme | null; muted?: boolean }) {
  setRoom(convId, (r) => (r.conv ? { conv: { ...r.conv, ...(patch.title ? { title: patch.title } : {}), ...(patch.theme !== undefined ? { theme: patch.theme } : {}), ...(patch.muted !== undefined ? { muted: patch.muted ? 1 : 0 } : {}) } } : {}));
  await call("PATCH", `/chat/${convId}`, patch);
  void refreshConv(convId);
}

// ---------------------------------------------------------------- room lifecycle

const live = new Map<string, Live>();
const refs = new Map<string, number>();
const polls = new Map<string, ReturnType<typeof setInterval>>();

function onRoomEvent(convId: string, e: Record<string, unknown>) {
  switch (e.t) {
    case "hello":
      setRoom(convId, () => ({ online: (e.online as string[]) ?? [] }));
      break;
    case "msg": {
      const m = e.msg as Msg;
      if (jobs.some((j) => j.id === m.id)) { jobs = jobs.filter((j) => j.id !== m.id); saveJobs(); } // our send landed
      setRoom(convId, (r) => {
        const typing = { ...r.typing };
        delete typing[m.senderId];
        return { msgs: merge(r.msgs, [m]), typing };
      });
      bumpList(m);
      break;
    }
    case "edit":
      setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === e.id ? { ...m, text: e.text as string | null, editedAt: e.editedAt as number } : m)) }));
      break;
    case "del":
      setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === e.id ? { ...m, deleted: 1, text: null, sticker: null, mediaId: null, reactions: {} } : m.reply && m.reply.id === e.id ? { ...m, reply: { ...m.reply, text: null, deleted: 1 } } : m)) }));
      break;
    case "react":
      setRoom(convId, (r) => ({ msgs: r.msgs.map((m) => (m.id === e.id ? { ...m, reactions: e.reactions as Msg["reactions"] } : m)) }));
      break;
    case "read":
      setRoom(convId, (r) => (r.conv ? { conv: { ...r.conv, members: r.conv.members.map((u) => (u.id === e.uid ? { ...u, lastReadAt: Math.max(u.lastReadAt ?? 0, e.at as number), lastSeenAt: Math.max(u.lastSeenAt ?? 0, e.at as number) } : u)) } } : {}));
      break;
    case "typing": {
      if (e.uid === myId) break;
      setRoom(convId, (r) => {
        const typing = { ...r.typing };
        if (e.on) typing[e.uid as string] = Date.now() + 6000; else delete typing[e.uid as string];
        return { typing };
      });
      if (e.on) setTimeout(() => setRoom(convId, (r) => {
        const typing = { ...r.typing };
        for (const [k, v] of Object.entries(typing)) if (v <= Date.now()) delete typing[k];
        return { typing };
      }), 6100);
      break;
    }
    case "presence":
      setRoom(convId, (r) => ({
        online: e.online ? [...new Set([...r.online, e.uid as string])] : r.online.filter((u) => u !== e.uid),
        conv: !e.online && r.conv ? { ...r.conv, members: r.conv.members.map((u) => (u.id === e.uid ? { ...u, lastSeenAt: (e.at as number) ?? Date.now() } : u)) } : r.conv,
      }));
      break;
    case "conv":
      void refreshConv(convId);
      break;
  }
}

function openRoom(convId: string) {
  refs.set(convId, (refs.get(convId) ?? 0) + 1);
  if (live.has(convId)) return;
  getRoom(convId);
  void refreshConv(convId);
  void syncLatest(convId);
  const l = new Live(`/chat/${encodeURIComponent(convId)}/ws`, (e) => onRoomEvent(convId, e), (s, reopened) => {
    setRoom(convId, () => ({ live: s }));
    clearInterval(polls.get(convId));
    if (s === "live") {
      if (reopened) { void syncLatest(convId); void refreshConv(convId); }
      void flushOutbox();
    } else if (s === "polling") {
      polls.set(convId, setInterval(() => { if (document.visibilityState === "visible") { void syncLatest(convId); } }, 5000));
    }
  });
  live.set(convId, l);
}
function closeRoom(convId: string) {
  const n = (refs.get(convId) ?? 1) - 1;
  refs.set(convId, n);
  if (n > 0) return;
  // small delay: React StrictMode / quick remounts reuse the same socket
  setTimeout(() => {
    if ((refs.get(convId) ?? 0) > 0) return;
    live.get(convId)?.stop();
    live.delete(convId);
    clearInterval(polls.get(convId));
    setRoom(convId, () => ({ online: [], typing: {}, live: "connecting" }));
  }, 300);
}

/** Subscribe to one conversation (opens its live connection while mounted). */
export function useRoom(convId: string): Room {
  useEffect(() => { if (!convId) return; openRoom(convId); return () => closeRoom(convId); }, [convId]);
  return useSyncExternalStore(
    (f) => { let s = roomSubs.get(convId); if (!s) roomSubs.set(convId, (s = new Set())); s.add(f); return () => void s!.delete(f); },
    () => getRoom(convId),
  );
}
export const peekRoom = (convId: string) => getRoom(convId);

// drafts survive leaving the room (and remounts)
const drafts = new Map<string, string>();
export const getDraft = (id: string) => drafts.get(id) ?? (() => { try { return sessionStorage.getItem(`il_chat_draft_${id}`) ?? ""; } catch { return ""; } })();
export const setDraft = (id: string, v: string) => { drafts.set(id, v); try { if (v) sessionStorage.setItem(`il_chat_draft_${id}`, v); else sessionStorage.removeItem(`il_chat_draft_${id}`); } catch { /* ignore */ } };

// ---------------------------------------------------------------- chat list + unread badge (one "inbox" socket per user)

interface ListState { convs: Conv[]; loaded: boolean; error: string | null }
let list: ListState = (() => { const c = cache.get<Conv[]>("chats"); return { convs: c ?? [], loaded: !!c, error: null }; })();
const listSubs = new Set<() => void>();
function setList(f: (l: ListState) => Partial<ListState>) {
  list = { ...list, ...f(list) };
  listSubs.forEach((s) => s());
  cache.set("chats", list.convs);
}
let unread = (() => cache.get<number>("chats:unread") ?? 0)();
const unreadSubs = new Set<() => void>();
function setUnread(n: number) { if (n === unread) return; unread = n; cache.set("chats:unread", n); unreadSubs.forEach((s) => s()); }

export async function refreshList() {
  try {
    const r = await call<{ me: string; convs: Conv[] }>("GET", "/chats");
    setChatMe(r.me);
    setList(() => ({ convs: r.convs, loaded: true, error: null }));
  } catch (e) { setList(() => ({ loaded: true, error: (e as Error).message })); }
}
export async function refreshUnread() {
  try { setUnread((await call<{ count: number }>("GET", "/chats/unread")).count); } catch { /* keep last */ }
}

function bumpList(m: Msg) {
  setList((l) => ({
    convs: l.convs.map((c) => (c.id === m.convId && m.createdAt >= (c.last?.createdAt ?? 0)
      ? { ...c, lastMessageAt: m.createdAt, last: { id: m.id, senderId: m.senderId, kind: m.kind, text: m.text, sticker: m.sticker, deleted: m.deleted, createdAt: m.createdAt } }
      : c)).sort((a, z) => z.lastMessageAt - a.lastMessageAt),
  }));
}

let inbox: Live | null = null;
let inboxRefs = 0;
let inboxTimer: ReturnType<typeof setTimeout> | undefined;
let inboxPoll: ReturnType<typeof setInterval> | undefined;
function inboxEvent(e: Record<string, unknown>) {
  if (e.t !== "conv") return;
  if (e.msg) bumpList(e.msg as Msg);
  clearTimeout(inboxTimer);
  inboxTimer = setTimeout(() => { if (listSubs.size) void refreshList(); void refreshUnread(); }, 250);
}
function openInbox() {
  inboxRefs++;
  if (inbox) return;
  void refreshUnread();
  inbox = new Live("/chats/ws", inboxEvent, (s, reopened) => {
    clearInterval(inboxPoll);
    if (s === "live" && reopened) { void refreshUnread(); if (listSubs.size) void refreshList(); }
    if (s === "polling") inboxPoll = setInterval(() => { if (document.visibilityState === "visible") { void refreshUnread(); if (listSubs.size) void refreshList(); } }, 20_000);
  });
}
function closeInbox() {
  inboxRefs--;
  setTimeout(() => { if (inboxRefs > 0 || !inbox) return; inbox.stop(); inbox = null; clearInterval(inboxPoll); }, 300);
}

/** Chat list (live). */
export function useChatList() {
  useEffect(() => { openInbox(); void refreshList(); return closeInbox; }, []);
  return useSyncExternalStore((f) => { listSubs.add(f); return () => void listSubs.delete(f); }, () => list);
}

/** Unread messages across all chats (for the nav badge). Keeps one small live connection open while mounted. */
export function useChatUnread(): number {
  useEffect(() => {
    openInbox();
    const vis = () => document.visibilityState === "visible" && void refreshUnread();
    document.addEventListener("visibilitychange", vis);
    return () => { closeInbox(); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return useSyncExternalStore((f) => { unreadSubs.add(f); return () => void unreadSubs.delete(f); }, () => unread);
}

export async function openDm(username: string) {
  return (await call<{ id: string }>("POST", "/chats/dm", { username })).id;
}
export async function createGroup(title: string, userIds: string[]) {
  return (await call<{ id: string }>("POST", "/chats/group", { title, userIds })).id;
}

// ---------------------------------------------------------------- helpers for the UI

export const mediaUrl = (id: string, thumb = false) => `/api/chat/media/${encodeURIComponent(id)}${thumb ? "?s=t" : ""}`;
export const displayName = (u: ChatUser | undefined | null) => u?.name || (u?.username ? `@${u.username}` : "Someone");

export function convTitle(c: Conv | null, me = myId) {
  if (!c) return "Chat";
  if (c.kind === "group") return c.title || "Group";
  return displayName(c.members.find((u) => u.id !== me) ?? c.members[0]);
}
export const otherMember = (c: Conv | null, me = myId) => (c?.kind === "dm" ? c.members.find((u) => u.id !== me) ?? null : null);

export function lastSeenText(at: number | null | undefined) {
  if (!at) return "";
  const d = Date.now() - at;
  if (d < 2 * 60e3) return "active now";
  if (d < 60 * 60e3) return `active ${Math.round(d / 60e3)} min ago`;
  if (d < 24 * 3600e3) return `active ${Math.round(d / 3600e3)} h ago`;
  if (d < 7 * 24 * 3600e3) return `active ${Math.round(d / (24 * 3600e3))} d ago`;
  return `last seen ${new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

export function previewText(m: Conv["last"] | Msg | null, me = myId, members: ChatUser[] = [], group = false): string {
  if (!m) return "No messages yet";
  const who = m.senderId === me ? "You: " : group ? `${(members.find((u) => u.id === m.senderId)?.name ?? "").split(" ")[0] || "Someone"}: ` : "";
  if (m.deleted) return `${who}Message deleted`;
  if (m.kind === "system") return `${m.senderId === me ? "You" : members.find((u) => u.id === m.senderId)?.name ?? "Someone"} ${m.text ?? ""}`;
  if (m.kind === "sticker") return `${who}Sticker`;
  if (m.kind === "image") return `${who}📷 ${m.text || "Photo"}`;
  if (m.kind === "voice") return `${who}🎤 Voice message`;
  return `${who}${m.text ?? ""}`;
}
