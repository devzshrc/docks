/* Turns any thrown or API error into one sentence a person can act on. Validation payloads (zod issue
 * arrays serialized as JSON), server configuration details and network failures never reach the UI raw. */

const FALLBACK = "Something went wrong. Try again in a moment.";

const BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Your session ended. Sign in again to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that. It may have been moved or deleted.",
  TOO_MANY_REQUESTS: "Too many requests. Wait a few seconds and try again.",
  TIMEOUT: "That took too long. Try again.",
  BAD_REQUEST: "Something didn't look right. Refresh the page and try again.",
  PRECONDITION_FAILED: "Something changed in the meantime. Refresh the page and try again.",
  CONFLICT: "Someone else changed this first. Refresh to see the latest.",
};

function codeOf(error: unknown): string | undefined {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === "string" ? data.code : undefined;
}

export function errorMessage(error: unknown): string {
  if (!error) return FALLBACK;
  const raw = typeof error === "string" ? error : ((error as { message?: unknown }).message as string | undefined);
  const message = typeof raw === "string" ? raw.trim() : "";
  const code = codeOf(error);

  if (!message || /^[[{]/.test(message)) return BY_CODE[code ?? "BAD_REQUEST"] ?? FALLBACK;
  if (/failed to fetch|networkerror|load failed|ECONNREFUSED/i.test(message)) return "Can't reach Docks right now. Check your connection and try again.";
  // Environment variable names and stack-like text are for operators, not users.
  if (/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(message) || /\bat .+:\d+:\d+/.test(message) || /is not set|not configured on the server/i.test(message))
    return "This isn't set up for your workspace yet. Ask your workspace admin.";
  if (code === "INTERNAL_SERVER_ERROR" && message.length > 160) return FALLBACK;
  return message;
}
