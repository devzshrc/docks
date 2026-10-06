import type { AuthUser } from "./auth.js";

/** Session user, as resolved by Better Auth in apps/server. */
export type User = Pick<
  AuthUser,
  "id" | "name" | "email" | "emailVerified" | "image"
>;

/**
 * Shared context shape.
 * apps/server builds this per-request (Better Auth session, request id).
 * Never put secrets here that the client could infer — context stays server-side.
 */
export interface Context {
  /** Authenticated user or null for anonymous requests. */
  user: User | null;
  /** Request id for tracing / logging. */
  requestId: string;
}

/** Helper for standalone (non-HTTP) callers — tests, scripts. */
export function createTestContext(overrides: Partial<Context> = {}): Context {
  return {
    user: null,
    requestId: `test-${Date.now()}`,
    ...overrides,
  };
}
