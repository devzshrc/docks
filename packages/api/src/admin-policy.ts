import { TRPCError } from "@trpc/server";
export type PlatformRole = "owner" | "support" | "viewer";
const list = (s = "") =>
  s
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
export function platformRole(
  email: string,
  env: Record<string, string | undefined> = process.env,
): PlatformRole | null {
  const e = email.toLowerCase();
  if (list(env.ADMIN_EMAILS).includes(e)) return "owner";
  if (list(env.ADMIN_SUPPORT_EMAILS).includes(e)) return "support";
  if (list(env.ADMIN_VIEWER_EMAILS).includes(e)) return "viewer";
  return null;
}
export function assertAdminAccess(
  user: { email: string; emailVerified: boolean; twoFactorEnabled?: boolean },
  role: PlatformRole | null,
) {
  if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  if (!user.emailVerified || !user.twoFactorEnabled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Verify your email and enable two-factor authentication in Account settings to access administration.",
    });
}
export function assertAdminWrite(
  role: PlatformRole,
  createdAt?: Date,
  ownerOnly = false,
  now = new Date(),
) {
  if (role === "viewer" || (ownerOnly && role !== "owner"))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your admin role cannot perform this action.",
    });
  if (
    !createdAt ||
    now.getTime() - createdAt.getTime() > 30 * 60_000 ||
    createdAt > now
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Sign out and sign in again to confirm your identity before changing access.",
    });
}
export type Grant = {
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
};
export function effectivePlan(
  paidPlan: "free" | "team",
  grants: Grant[],
  now = new Date(),
): "free" | "team" {
  return paidPlan === "team" ||
    grants.some(
      (g) =>
        !g.revokedAt &&
        g.startsAt <= now &&
        (!g.expiresAt || g.expiresAt > now),
    )
    ? "team"
    : "free";
}
export const RETRYABLE_JOBS = [
  "sync_repo",
  "sync_pr",
  "sync_user_repos",
  "sync_issues",
  "sync_issue",
] as const;
export function deviceLabel(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} · ${os}`;
}
