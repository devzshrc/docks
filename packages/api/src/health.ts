/** Daily sync health from the job queue, shaped for the Status Bars component. */

export type DayStatus = "up" | "degraded" | "down" | "none";

export interface HealthDay {
  /** ISO date, e.g. "2026-10-07". */
  date: string;
  status: DayStatus;
  /** Share of jobs that succeeded, 0-100. */
  uptime?: number;
  incidents?: { title: string; status: "degraded" | "down" }[];
}

export interface DayCounts {
  date: string;
  done: number;
  failed: number;
}

/** No jobs = no data. All good = up. Some failures = degraded. Mostly failures = down. */
export function dayStatus(done: number, failed: number): DayStatus {
  const total = done + failed;
  if (total === 0) return "none";
  if (failed === 0) return "up";
  return failed / total >= 0.5 ? "down" : "degraded";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** `days` consecutive dates ending today (UTC), oldest first, each filled from the counts (or "none"). */
export function healthDays(counts: DayCounts[], today: Date, days = 90): HealthDay[] {
  const byDate = new Map(counts.map((c) => [c.date, c]));
  const out: HealthDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = iso(new Date(today.getTime() - i * 86_400_000));
    const c = byDate.get(date);
    if (!c) {
      out.push({ date, status: "none" });
      continue;
    }
    const status = dayStatus(c.done, c.failed);
    out.push({
      date,
      status,
      uptime: Math.round((c.done / (c.done + c.failed)) * 100),
      ...(c.failed > 0 && status !== "up" && status !== "none"
        ? { incidents: [{ title: `${c.failed} of ${c.done + c.failed} sync jobs failed`, status: status === "down" ? ("down" as const) : ("degraded" as const) }] }
        : {}),
    });
  }
  return out;
}
