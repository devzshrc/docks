import type { WorkSchedule } from "@docks/db";
import { z } from "zod";

export const scheduleSchema = z
  .object({
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Choose an IANA timezone"),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  })
  .refine(
    (s) => s.endHour > s.startHour,
    "Work hours must end after they start",
  );
export const rulesSchema = z
  .object({
    hours: z.number().int().min(1).max(80),
    reminderHours: z.number().int().min(0).max(79),
    schedule: scheduleSchema,
    leadUserId: z.string().min(1).max(100),
  })
  .refine(
    (r) => r.reminderHours < r.hours,
    "Reminder must precede the deadline",
  );
const formatters = new Map<string, Intl.DateTimeFormat>();
function local(date: Date, schedule: WorkSchedule) {
  let formatter = formatters.get(schedule.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    formatters.set(schedule.timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.weekday!,
    ),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}
function interval(date: Date, schedule: WorkSchedule) {
  const p = local(date, schedule);
  return {
    working:
      schedule.days.includes(p.day) &&
      p.hour >= schedule.startHour &&
      p.hour < schedule.endHour,
    minutes: 60 - p.minute,
  };
}
/** Count elapsed working minutes, including real elapsed time across DST changes. */
export function workingMinutes(from: Date, to: Date, schedule: WorkSchedule) {
  let time = Math.ceil(from.getTime() / 60000) * 60000;
  const end = Math.floor(to.getTime() / 60000) * 60000;
  let total = 0;
  while (time < end) {
    const step = interval(new Date(time), schedule);
    const minutes = Math.min(step.minutes, (end - time) / 60000);
    if (step.working) total += minutes;
    time += minutes * 60000;
  }
  return total;
}
export function addWorkingMinutes(
  from: Date,
  minutes: number,
  schedule: WorkSchedule,
): Date {
  let time = Math.ceil(from.getTime() / 60000) * 60000;
  const limit = time + 730 * 86400000;
  while (minutes > 0 && time < limit) {
    const step = interval(new Date(time), schedule);
    const advance = step.working
      ? Math.min(step.minutes, minutes)
      : step.minutes;
    if (step.working) minutes -= advance;
    time += advance * 60000;
  }
  if (minutes > 0) throw new Error("Deadline exceeds two years");
  return new Date(time);
}
export function isWorkingTime(now: Date, schedule: WorkSchedule) {
  return interval(now, schedule).working;
}
