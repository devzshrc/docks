import assert from "node:assert/strict";
import { test } from "node:test";
import { addWorkingMinutes, workingMinutes, rulesSchema } from "./clock.js";
const utc = {
  timezone: "UTC",
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
};
test("deadlines skip weekends and preserve fractional working hours", () => {
  const start = new Date("2026-10-09T16:30:00Z");
  const end = addWorkingMinutes(start, 120, utc);
  assert.equal(end.toISOString(), "2026-10-12T10:30:00.000Z");
  assert.equal(workingMinutes(start, end, utc), 120);
  assert.equal(workingMinutes(end, start, utc), 0);
});
test("work clocks count real elapsed minutes across DST and half-hour timezones", () => {
  const ny = {
    timezone: "America/New_York",
    days: [0],
    startHour: 0,
    endHour: 5,
  };
  assert.equal(
    addWorkingMinutes(new Date("2026-03-08T06:00:00Z"), 120, ny).toISOString(),
    "2026-03-08T08:00:00.000Z",
  );
  assert.equal(
    workingMinutes(
      new Date("2026-11-01T04:00:00Z"),
      new Date("2026-11-01T10:00:00Z"),
      ny,
    ),
    360,
  );
  const india = { ...utc, timezone: "Asia/Kolkata" };
  assert.equal(
    addWorkingMinutes(
      new Date("2026-10-05T03:00:00Z"),
      60,
      india,
    ).toISOString(),
    "2026-10-05T04:30:00.000Z",
  );
});
test("policies reject invalid schedules and reminders after deadlines", () => {
  const rules = {
    hours: 8,
    reminderHours: 2,
    schedule: utc,
    leadUserId: "lead",
  };
  assert.equal(rulesSchema.safeParse(rules).success, true);
  assert.equal(
    rulesSchema.safeParse({ ...rules, reminderHours: 8 }).success,
    false,
  );
  assert.equal(
    rulesSchema.safeParse({
      ...rules,
      schedule: { ...utc, timezone: "bad", days: [] },
    }).success,
    false,
  );
  assert.equal(
    rulesSchema.safeParse({
      ...rules,
      schedule: { ...utc, startHour: 17, endHour: 9 },
    }).success,
    false,
  );
});
