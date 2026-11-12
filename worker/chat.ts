import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/**
 * Chat fan-out, one instance per conversation ("<mode>:c:<convId>") and one "inbox" per user ("<mode>:u:<userId>").
 *
 * Uses the WebSocket Hibernation API: sockets are accepted with ctx.acceptWebSocket, so the object can be evicted from
 * memory while sockets stay open (no duration billing on idle chats). Per-socket state lives in the attachment
 * ({uid, dev, room, hidden}); nothing is kept in memory between events. The literal "ping" text frame is answered with
 * "pong" by the runtime itself (setWebSocketAutoResponse) without waking the object → cheap client heartbeats.
 *
 * D1 stays the source of truth: the Worker writes, then POSTs the event JSON to /broadcast here. Clients send only
 * {t:"typing", on} through the socket (relayed to the room and to the other members' inboxes for the list). Presence = which members currently have a socket open to this room.
 */
type Att = { uid: string; dev: boolean; room: boolean; hidden: boolean; conv?: string; members?: string[] };

export class ChatRoom extends DurableObject<Env["Bindings"]> {
  constructor(ctx: DurableObjectState, env: Env["Bindings"]) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/broadcast" && req.method === "POST") {
      this.send(await req.text());
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
      const att: Att = {
        uid: req.headers.get("x-chat-uid") ?? "",
        dev: req.headers.get("x-chat-dev") === "1",
        room: req.headers.get("x-chat-room") === "1",
        hidden: req.headers.get("x-chat-hidden") === "1",
        conv: req.headers.get("x-chat-conv") ?? undefined,
        members: (req.headers.get("x-chat-members") ?? "").split(",").filter(Boolean).slice(0, 40),
      };
      if (!att.uid) return new Response("no user", { status: 400 });
      const { 0: client, 1: server } = new WebSocketPair();
      const firstSocket = this.ctx.getWebSockets(att.uid).length === 0;
      this.ctx.acceptWebSocket(server, [att.uid]);
      server.serializeAttachment(att);
      server.send(JSON.stringify({ t: "hello", online: att.room ? this.online() : [], at: Date.now() }));
      if (att.room && firstSocket && !att.hidden) this.send(JSON.stringify({ t: "presence", uid: att.uid, online: true }), server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 512) return;
    const att = ws.deserializeAttachment() as Att | null;
    if (!att?.room) return;
    let m: { t?: string; on?: boolean };
    try { m = JSON.parse(message); } catch { return; }
    if (m.t !== "typing") return;
    this.send(JSON.stringify({ t: "typing", uid: att.uid, on: !!m.on }), ws);
    // also to the other members' inboxes → "typing…" in their chat list (clients send at most one "on" per 2.5 s)
    if (att.conv && att.members?.length) {
      const ns = this.env.CHAT;
      const ev = JSON.stringify({ t: "conv", convId: att.conv, ev: "typing", by: att.uid, on: !!m.on });
      const mode = att.dev ? "dev" : "real";
      await Promise.all(att.members.filter((u) => u !== att.uid).map((u) =>
        ns.get(ns.idFromName(`${mode}:u:${u}`)).fetch("https://chat/broadcast", { method: "POST", body: ev }).then((r) => r.body?.cancel()).catch(() => {})));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch { /* already closed */ }
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.left(ws);
  }

  /** When someone's last socket to this room closes: presence off + "last seen" now. */
  private async left(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Att | null;
    if (!att?.room) return;
    const still = this.ctx.getWebSockets(att.uid).some((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (still) return;
    if (!att.hidden) this.send(JSON.stringify({ t: "presence", uid: att.uid, online: false, at: Date.now() }), ws);
    const d1 = att.dev ? this.env.DB_DEV : this.env.DB;
    await d1.prepare("update users set last_seen_at = ? where id = ?").bind(Date.now(), att.uid).run().catch(() => {});
  }

  private online() {
    const ids = new Set<string>();
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() as Att | null;
      if (a && !a.hidden && s.readyState === WebSocket.OPEN) ids.add(a.uid);
    }
    return [...ids];
  }

  private send(data: string, except?: WebSocket) {
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      try { s.send(data); } catch { /* closing */ }
    }
  }
}
