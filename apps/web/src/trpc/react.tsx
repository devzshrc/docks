"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "@/components/toast";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import { useState } from "react";
import type { AppRouter } from "@docks/api";

/**
 * tRPC v11 + TanStack Query provider.
 * Single typed client for the whole app. Server URL points at Express.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // A mutation can opt in to a success toast with `meta: { toast: "Saved" }`.
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            const message = mutation.meta?.toast
            if (typeof message === "string") toast(message)
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retry server/network hiccups once; a 4xx (forbidden, not found, bad input) won't change.
            retry: (failures, error) => {
              const status = (error as { data?: { httpStatus?: number } }).data?.httpStatus
              return failures < 1 && !(status && status >= 400 && status < 500)
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/trpc`,
          transformer: superjson,
          maxURLLength: 2083,
          // Send the Better Auth session cookie on every tRPC call.
          fetch(url, options) {
            return fetch(url, { ...options, credentials: "include" });
          },
        }),
      ],
    })
  );

  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TRPCProvider>
  );
}
