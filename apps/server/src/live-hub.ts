/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import type { LiveEvent, LivePublisher } from "@docks/api";

/**
 * One per workspace. Holds the open /live sockets with hibernation, so idle
 * connections cost nothing; jobs and requests POST /publish to fan out.
 */
export class WorkspaceHub extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/publish") {
      const { event, userId } = (await request.json()) as { event: LiveEvent; userId?: string };
      const message = JSON.stringify(event);
      for (const ws of this.ctx.getWebSockets(userId ? `u:${userId}` : undefined)) {
        try {
          ws.send(message);
        } catch {
          /* closing socket */
        }
      }
      return new Response(null, { status: 204 });
    }
    const userId = request.headers.get("x-live-user");
    if (!userId || request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response("Bad request", { status: 400 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [`u:${userId}`]);
    // Answer keep-alive pings without waking the object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(ws: WebSocket, code: number) {
    ws.close(code === 1005 ? 1000 : code);
  }
}

export interface LiveEnv {
  LIVE?: DurableObjectNamespace<WorkspaceHub>;
}

const hub = (env: LiveEnv, workspaceId: string) => env.LIVE!.get(env.LIVE!.idFromName(workspaceId));

export function hubPublisher(env: LiveEnv): LivePublisher | undefined {
  if (!env.LIVE) return undefined;
  return async (workspaceId, event, userId) => {
    await hub(env, workspaceId).fetch("https://hub/publish", {
      method: "POST",
      body: JSON.stringify({ event, userId }),
    });
  };
}

/** Hand an authorized upgrade to the workspace's hub. */
export function connectToHub(env: LiveEnv, request: Request, who: { userId: string; workspaceId: string }) {
  if (!env.LIVE) return new Response("Live updates aren't configured", { status: 503 });
  const headers = new Headers(request.headers);
  headers.set("x-live-user", who.userId);
  return hub(env, who.workspaceId).fetch(new Request(request.url, { headers }));
}
