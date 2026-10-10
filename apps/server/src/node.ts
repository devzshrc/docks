import { serve } from "@hono/node-server";
import { logEvent } from "@docks/api";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { startWorker } from "./jobs/worker.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

serve({ fetch: createApp().fetch, port: PORT }, () => {
  logEvent("info", "server.started", { port: PORT });
});
startWorker();
logEvent("info", "jobs.started");
