"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { toast } from "@/components/toast";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import { useEffect, useRef, useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { useSession } from "@/lib/auth-client";
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE,
  persistListQuery,
  queryCacheKey,
} from "@/lib/query-persistence";
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
  const { data: session } = useSession();
  const scope = session
    ? queryCacheKey(getBaseUrl(), session.user.id, session.session.id)
    : undefined;
  // Changing accounts or signing out replaces the entire in-memory client as well.
  return (
    <ScopedProvider key={scope ?? "anonymous"} scope={scope}>
      {children}
    </ScopedProvider>
  );
}

function ScopedProvider({
  children,
  scope,
}: {
  children: React.ReactNode;
  scope?: string;
}) {
  const active = useRef(true);
  const [persister] = useState(() =>
    createAsyncStoragePersister({
      key: scope,
      throttleTime: 0,
      serialize: superjson.stringify,
      deserialize: superjson.parse,
      storage:
        scope && typeof window !== "undefined"
          ? {
              getItem: (key: string) => {
                try {
                  return window.localStorage.getItem(key);
                } catch {
                  return null;
                }
              },
              setItem: (key: string, value: string) => {
                if (!active.current) return;
                try {
                  if (value.length <= 1_000_000)
                    window.localStorage.setItem(key, value);
                } catch {
                  /* Private mode or full storage: ordinary queries still work. */
                }
              },
              removeItem: (key: string) => {
                try {
                  window.localStorage.removeItem(key);
                } catch {}
              },
            }
          : undefined,
    }),
  );
  useEffect(() => {
    active.current = true;
    // Sign-out or account switch: drop other sessions' cached lists, keep this one.
    if (scope && typeof window !== "undefined") {
      try {
        for (const key of Object.keys(window.localStorage))
          if (key.startsWith("docks:queries:") && key !== scope)
            window.localStorage.removeItem(key);
      } catch {
        /* storage may be unavailable */
      }
    }
    return () => {
      active.current = false;
    };
  }, [persister, scope]);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // A mutation can opt in to a success toast with `meta: { toast: "Saved" }`.
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            const message = mutation.meta?.toast;
            if (typeof message === "string") toast(message);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: CACHE_MAX_AGE,
            // Retry server/network hiccups once; a 4xx (forbidden, not found, bad input) won't change.
            retry: (failures, error) => {
              const status = (error as { data?: { httpStatus?: number } }).data
                ?.httpStatus;
              return failures < 1 && !(status && status >= 400 && status < 500);
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
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
    }),
  );

  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {scope ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: CACHE_MAX_AGE,
            buster: CACHE_BUSTER,
            dehydrateOptions: {
              shouldDehydrateQuery: persistListQuery,
              shouldDehydrateMutation: () => false,
            },
          }}
          onSuccess={() => {
            void queryClient.invalidateQueries();
          }}
        >
          {children}
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )}
    </TRPCProvider>
  );
}
