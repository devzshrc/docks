import { createNodeWebSocket } from "@hono/node-ws";
import { subscribeLocal } from "@docks/api";
import type { Hono } from "hono";
import { authorizeLive, type AppEnv } from "./app.js";

/** GET /live on the Node server: WebSockets fed by the in-process hub. */
export function attachLive(app: Hono<AppEnv>) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  const sessions = new WeakMap<Request, { userId: string; workspaceId: string }>();
  app.get(
    "/live",
    async (c, next) => {
      const who = await authorizeLive(c.req.raw);
      if (who instanceof Response) return who;
      sessions.set(c.req.raw, who);
      await next();
    },
    upgradeWebSocket((c) => {
      const who = sessions.get(c.req.raw)!;
      let off: (() => void) | undefined;
      return {
        onOpen: (_event, ws) => {
          off = subscribeLocal(who.workspaceId, who.userId, (event) => ws.send(JSON.stringify(event)));
        },
        onMessage: (event, ws) => {
          if (event.data === "ping") ws.send("pong");
        },
        onClose: () => off?.(),
      };
    }),
  );
  return injectWebSocket;
}
