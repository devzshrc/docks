import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { enqueue } from "../jobs.js";
import { decrypt, encrypt, signState, verifyState } from "../crypto.js";
import { userClient } from "./github.js";

/**
 * GitHub App user authorization (OAuth web flow). Gives each person a
 * user-to-server token so actions are attributed to them.
 *
 * Env: GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, BETTER_AUTH_URL.
 * The App's "Callback URL" must be <BETTER_AUTH_URL>/integrations/github/oauth/callback.
 */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function redirectUri() {
  return `${process.env.BETTER_AUTH_URL ?? "http://localhost:4000"}/integrations/github/oauth/callback`;
}

export function authorizeUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: env("GITHUB_APP_CLIENT_ID"),
    redirect_uri: redirectUri(),
    state: signState(userId),
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("GITHUB_APP_CLIENT_ID"),
      client_secret: env("GITHUB_APP_CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = (await res.json()) as TokenResponse;
  if (!res.ok || body.error || !body.access_token) {
    throw new Error(`GitHub token exchange failed: ${body.error_description ?? body.error ?? res.status}`);
  }
  return body;
}

const inSeconds = (s?: number) => (s ? new Date(Date.now() + s * 1000) : null);

function tokenColumns(t: TokenResponse) {
  return {
    accessTokenEncrypted: encrypt(t.access_token!),
    accessTokenExpiresAt: inSeconds(t.expires_in),
    refreshTokenEncrypted: t.refresh_token ? encrypt(t.refresh_token) : null,
    refreshTokenExpiresAt: inSeconds(t.refresh_token_expires_in),
  };
}

/** Finish the OAuth flow: verify state, exchange code, store identity + tokens. */
export async function completeAuthorization(userId: string, code: string, state: string) {
  if (!verifyState(state, userId)) throw new Error("Invalid or expired state");
  const tokens = await tokenRequest({ code, redirect_uri: redirectUri() });
  const me = await userClient(async () => tokens.access_token!).me();
  const values = {
    userId,
    githubLogin: me.login,
    githubUserId: me.id,
    ...tokenColumns(tokens),
  };
  // One GitHub account per app user; re-linking moves it to the latest user.
  await db.transaction(async (tx) => {
    await tx.delete(schema.githubIdentity).where(eq(schema.githubIdentity.githubUserId, me.id));
    await tx
      .insert(schema.githubIdentity)
      .values(values)
      .onConflictDoUpdate({ target: schema.githubIdentity.userId, set: values });
  });
  await syncUserRepos(userId).catch(() => enqueue("sync_user_repos", { userId }));
}

/** Valid access token for a user, refreshing it when it's about to expire. */
export async function getUserToken(userId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.githubIdentity)
    .where(eq(schema.githubIdentity.userId, userId))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Connect your GitHub account to review and merge from here",
    });
  }
  const reconnect = new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Your GitHub connection needs refreshing. Reconnect GitHub in Integrations.",
  });
  // Unreadable token (key rotated, or a placeholder from the demo seed).
  const readable = (sealed: string) => {
    try {
      return decrypt(sealed);
    } catch {
      throw reconnect;
    }
  };
  const expiresAt = row.accessTokenExpiresAt?.getTime();
  if (!expiresAt || expiresAt - Date.now() > 60_000) return readable(row.accessTokenEncrypted);

  if (!row.refreshTokenEncrypted || (row.refreshTokenExpiresAt?.getTime() ?? 0) < Date.now()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your GitHub connection expired. Reconnect GitHub.",
    });
  }
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: readable(row.refreshTokenEncrypted),
  });
  await db
    .update(schema.githubIdentity)
    .set(tokenColumns(tokens))
    .where(eq(schema.githubIdentity.userId, userId));
  return tokens.access_token!;
}

export function githubAs(userId: string) {
  return userClient(() => getUserToken(userId));
}

export async function githubIdentity(userId: string) {
  const [row] = await db
    .select({ login: schema.githubIdentity.githubLogin })
    .from(schema.githubIdentity)
    .where(eq(schema.githubIdentity.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Refresh which of our repos this person can see on GitHub (M2). Replaces
 * their rows wholesale, so access GitHub removed disappears here too.
 */
export async function syncUserRepos(userId: string) {
  const gh = githubAs(userId);
  const ours = new Set(
    (await db.select({ id: schema.githubInstallation.id }).from(schema.githubInstallation)).map((r) => r.id),
  );
  const installations = (await gh.installations()).filter((i) => ours.has(i.id));
  const repoIds = new Set<number>();
  for (const inst of installations) {
    for (const repo of await gh.installationRepos(inst.id)) repoIds.add(repo.id);
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.githubRepoAccess).where(eq(schema.githubRepoAccess.userId, userId));
    if (repoIds.size) {
      await tx.insert(schema.githubRepoAccess).values([...repoIds].map((repoId) => ({ userId, repoId })));
    }
  });
}

/** Queue a refresh for everyone with a linked GitHub account (scheduler, every 6h). */
export async function scheduleUserRepoSync(userIds?: string[]) {
  const rows = await db
    .select({ userId: schema.githubIdentity.userId })
    .from(schema.githubIdentity)
    .where(userIds?.length ? inArray(schema.githubIdentity.userId, userIds) : undefined);
  for (const r of rows) await enqueue("sync_user_repos", { userId: r.userId });
}
