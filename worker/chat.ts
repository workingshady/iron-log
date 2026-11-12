import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/** One instance per conversation: WebSocket fan-out (hibernation API), typing, presence. Owned by the Chat agent. */
export class ChatRoom extends DurableObject<Env["Bindings"]> {
  async fetch(_req: Request): Promise<Response> {
    return new Response("chat not ready", { status: 501 });
  }
}
