import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { startWorker } from "./jobs/worker.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

serve({ fetch: createApp().fetch, port: PORT }, () => {
  console.log(`[server] tRPC listening on http://localhost:${PORT}/trpc`);
  console.log(`[server] auth  listening on http://localhost:${PORT}/api/auth`);
  console.log(`[server] healthz      on http://localhost:${PORT}/healthz`);
});
startWorker();
console.log("[server] job worker started");
