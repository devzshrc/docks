import { logError } from "./logger.js";
import { db, schema } from "@docks/db";
import { track } from "./analytics.js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isSuspended } from "./account-status.js";
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
      .where(
        and(
          eq(schema.account.id, account.id),
          eq(schema.account.providerId, "github"),
        ),
      );
  } catch (err) {
    logError("auth.failed", err);
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
          intro:
            "Someone asked to reset the password for your Docks account. The link works for one hour.",
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
        ...actionEmail({
          intro: "Confirm your email address to finish setting up Docks.",
          action: "Confirm email",
          url,
        }),
      });
    },
  },
  socialProviders: github,
  // Same verified email on GitHub and on an existing account: one person, one account.
  account: { accountLinking: { enabled: true, trustedProviders: ["github"] } },
  user: {
    deleteUser: { enabled: true },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/sign-in/email" &&
        ctx.context.returned instanceof APIError
      ) {
        await db
          .insert(schema.authEvent)
          .values({ kind: "login_failed" })
          .catch(() => {});
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          if (await isSuspended(session.userId))
            throw new APIError("FORBIDDEN", {
              message: "Account suspended. Contact support.",
            });
          return { data: session };
        },
      },
    },
    user: {
      create: {
        after: async (user) => void (await track(user.id, null, "signed_up")),
      },
    },
    // After GitHub sign-in: connect the account for acting as the person (encrypted), then drop Better Auth's
    // plaintext copy of the tokens. A failure here must never block the login itself.
    account: {
      create: { after: scrubGithubTokens },
      update: { after: scrubGithubTokens },
    },
  },
  // Built-in limiter on /api/auth/* (sign-in, sign-up, reset). Session reads run on every page load and
  // must never throttle, or ordinary navigation signs people out.
  rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/get-session": false } },
  plugins: [
    twoFactor({ issuer: "Docks" }),
    {
      id: "admin-login-observability",
      hooks: {
        after: [
          {
            matcher: () => true,
            handler: createAuthMiddleware(async (ctx) => {
              // Run after the 2FA plugin: a password-only challenge clears newSession.
              const session = ctx.context.newSession;
              const loginPath =
                ctx.path.startsWith("/sign-in/") ||
                ctx.path.startsWith("/callback/") ||
                ctx.path === "/verify-email" ||
                /^\/two-factor\/verify-(totp|otp|backup-code)$/.test(ctx.path);
              if (
                session &&
                loginPath &&
                !(ctx.context.returned instanceof APIError)
              ) {
                await db
                  .insert(schema.authEvent)
                  .values({ userId: session.user.id, kind: "login" })
                  .catch(() => {});
              }
            }),
          },
        ],
      },
    },
  ],
  // Web and API live on sibling subdomains in production (app.<domain> / api.<domain>):
  // set COOKIE_DOMAIN=.<domain> so the session cookie is shared between them.
  // Read sessions from the database so administrative revocation applies immediately.
  session: { cookieCache: { enabled: false } },
  advanced: {
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    ...(process.env.COOKIE_DOMAIN
      ? {
          useSecureCookies: true,
          crossSubDomainCookies: {
            enabled: true,
            domain: process.env.COOKIE_DOMAIN,
          },
        }
      : {}),
  },
  trustedOrigins: [
    process.env.CLIENT_URL ?? "http://localhost:3000",
    "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = Session["user"];
