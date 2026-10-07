import { db, schema } from "@docks/db";
import { track } from "./analytics.js";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { actionEmail, sendEmail } from "./email.js";
import { linkFromSignIn } from "./review/github-user.js";

/**
 * Better Auth instance — email + password, GitHub sign-in, TOTP 2FA.
 * Single source of truth, mirroring the tRPC routers:
 *  - apps/server mounts `auth.handler` at /api/auth (Express via toNodeHandler)
 *    and resolves sessions in the tRPC context.
 *  - apps/web uses `createAuthClient` with `baseURL: <server>/api/auth`.
 *
 * Env (apps/server/.env):
 *  - DATABASE_URL, BETTER_AUTH_SECRET (min 32 chars), BETTER_AUTH_URL
 *  - GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET enable "Continue with GitHub".
 *    Add <BETTER_AUTH_URL>/api/auth/callback/github as a callback URL on the App.
 *  - RESEND_API_KEY / EMAIL_FROM for verification and reset emails (see email.ts).
 */
const github =
  process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_APP_CLIENT_ID,
          clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
        },
      }
    : undefined;

export const githubLoginEnabled = Boolean(github);

async function scrubGithubTokens(account: {
  id: string;
  userId: string;
  providerId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
}) {
  if (account.providerId !== "github" || !account.accessToken) return;
  try {
    await linkFromSignIn(account.userId, account);
    await db
      .update(schema.account)
      .set({ accessToken: null, refreshToken: null, idToken: null })
      .where(and(eq(schema.account.id, account.id), eq(schema.account.providerId, "github")));
  } catch (err) {
    console.error(`[auth] couldn't link GitHub after sign-in: ${(err as Error).message}`);
  }
}

export const auth = betterAuth({
  appName: "Docks",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Docks password",
        ...actionEmail({
          intro: "Someone asked to reset the password for your Docks account. The link works for one hour.",
          action: "Reset password",
          url,
        }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Confirm your email for Docks",
        ...actionEmail({ intro: "Confirm your email address to finish setting up Docks.", action: "Confirm email", url }),
      });
    },
  },
  socialProviders: github,
  // Same verified email on GitHub and on an existing account: one person, one account.
  account: { accountLinking: { enabled: true, trustedProviders: ["github"] } },
  user: {
    deleteUser: { enabled: true },
  },
  databaseHooks: {
    user: { create: { after: async (user) => void (await track(user.id, null, "signed_up")) } },
    // After GitHub sign-in: connect the account for acting as the person (encrypted), then drop Better Auth's
    // plaintext copy of the tokens. A failure here must never block the login itself.
    account: { create: { after: scrubGithubTokens }, update: { after: scrubGithubTokens } },
  },
  // Built-in limiter on /api/auth/* (sign-in, sign-up, reset).
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [twoFactor({ issuer: "Docks" })],
  trustedOrigins: [
    process.env.CLIENT_URL ?? "http://localhost:3000",
    "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = Session["user"];
