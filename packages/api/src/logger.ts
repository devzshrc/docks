import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { redactDiagnostic } from "./diagnostics.js";

export interface LogContext {
  requestId?: string;
  release?: string;
  jobId?: number;
}
const context = new AsyncLocalStorage<LogContext>();
export type TraceRunner = (
  name: string,
  task: () => Promise<unknown>,
) => Promise<unknown>;
const tracing = new AsyncLocalStorage<TraceRunner>();
export function withTraceRunner<T>(runner: TraceRunner, task: () => T): T {
  return tracing.run(runner, task);
}
export async function inSpan<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  const runner = tracing.getStore();
  return runner ? ((await runner(name, task)) as T) : await task();
}
export function withLogContext<T>(value: LogContext, task: () => T): T {
  return context.run({ ...context.getStore(), ...value }, task);
}
export function correlationId(value: string | null): string {
  return value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : randomUUID();
}
export function currentRequestId(): string | undefined {
  return context.getStore()?.requestId;
}

/** Metadata only. Callers must never pass bodies, payloads, headers or provider responses. */
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  try {
    const safe = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        typeof value === "string"
          ? redactDiagnostic(value).slice(0, 1000)
          : value,
      ]),
    );
    const entry = {
      ...safe,
      ...context.getStore(),
      timestamp: new Date().toISOString(),
      level,
      event,
      service: "docks-api",
      environment: process.env.OBSERVABILITY_ENVIRONMENT ?? "development",
      release:
        context.getStore()?.release ?? process.env.RELEASE_SHA ?? "unknown",
    };
    console[level === "info" ? "log" : level](JSON.stringify(entry));
  } catch {
    /* Diagnostics must never break product behavior. */
  }
}

/** Do not emit raw exception messages: dependency errors can embed customer data. */
export function logError(
  event: string,
  error: unknown,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  logEvent("error", event, {
    ...fields,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
