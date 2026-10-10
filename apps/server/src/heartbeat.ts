import { logEvent, logError } from "@docks/api";

/** Deployment-owned secret; never supplied by users and never printed. */
export async function sendHeartbeat(url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    if (new URL(url).protocol !== "https:")
      throw new Error("Heartbeat requires HTTPS");
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("Heartbeat rejected");
    await response.body?.cancel();
    logEvent("info", "monitor.heartbeat", { outcome: "ok" });
  } catch (error) {
    logError("monitor.heartbeat_failed", error);
  }
}
