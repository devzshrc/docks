import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client — talks to Express at <server>/api/auth.
 * Session cookie is httpOnly; the tRPC link sends it via credentials: "include".
 */
export const authClient = createAuthClient({
  baseURL: `${process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"}/api/auth`,
  plugins: [
    twoFactorClient({
      // Password was right and 2FA is on: finish sign-in on the code page.
      onTwoFactorRedirect() {
        window.location.href = `/two-factor${window.location.search}`;
      },
    }),
  ],
});

export const { useSession } = authClient;
