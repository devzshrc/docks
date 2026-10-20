import type { QueryKey } from "@tanstack/react-query";

export const CACHE_MAX_AGE = 15 * 60_000;
export const CACHE_BUSTER = "docks-lists-v1";

/** Authenticated identity and API origin are both part of the cache boundary. */
export function queryCacheKey(
  origin: string,
  userId: string,
  sessionId: string,
) {
  return `docks:queries:${encodeURIComponent(origin)}:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}`;
}

/** Persist list screens only. Never save code, Ask answers, tokens, admin data or permissions. */
export function persistListQuery(query: {
  queryKey: QueryKey;
  state: { status: string };
}) {
  if (query.state.status !== "success") return false;
  const path = query.queryKey[0];
  if (!Array.isArray(path)) return false;
  return new Set([
    // The workspace list and repo list let the shell render before the network
    // answers. Both hold names and ids only; permissions stay server-side.
    "workspace.list",
    "workspace.repos",
    "review.board",
    "review.savedViews",
    "reviewInbox.list",
    "inbox.list",
    "inbox.unreadCount",
    "issues.list",
    "issues.board",
    "issues.counts",
  ]).has(path.join("."));
}
