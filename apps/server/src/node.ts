import { serve } from "@hono/node-server";
import { logEvent } from "@docks/api";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { startWorker } from "./jobs/worker.js";
import { attachLive } from "./live-node.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
const injectWebSocket = attachLive(app);
const server = serve({ fetch: app.fetch, port: PORT }, () => {
  logEvent("info", "server.started", { port: PORT });
});
injectWebSocket(server);
startWorker();
logEvent("info", "jobs.started");
