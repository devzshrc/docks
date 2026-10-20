"use client";

import type { LiveEvent } from "@docks/api";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";

import { useTRPC } from "@/trpc/react";

const LiveContext = createContext({ connected: false });

const MAX_BACKOFF_MS = 30_000;
const PING_MS = 25_000;

/**
 * One socket per tab to `/live`. Events only say which kind of data changed;
 * matching queries are invalidated and re-fetched through tRPC as usual.
 */
export function LiveProvider({
  workspaceId,
  children,
}: {
  workspaceId: string | undefined;
  children: React.ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!workspaceId || typeof WebSocket === "undefined") return;
    const keys: Record<LiveEvent["t"], QueryKey[]> = {
      pr: [trpc.review.pathKey(), trpc.inbox.pathKey(), trpc.reviewInbox.pathKey(), trpc.people.pathKey(), trpc.delivery.pathKey()],
      guide: [trpc.review.guide.pathKey()],
      inbox: [trpc.inbox.pathKey(), trpc.reviewInbox.pathKey()],
      release: [trpc.releases.pathKey()],
      issues: [trpc.issues.pathKey(), trpc.issue.pathKey()],
    };
    const base = (process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000").replace(/^http/, "ws");
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;
    let stopped = false;

    const open = () => {
      socket = new WebSocket(`${base}/live?workspaceId=${encodeURIComponent(workspaceId)}`);
      socket.onopen = () => {
        // Anything could have changed while we were away: refresh once, then rely on events.
        if (attempt > 0) void queryClient.invalidateQueries();
        attempt = 0;
        setConnected(true);
        ping = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), PING_MS);
      };
      socket.onmessage = (message) => {
        if (message.data === "pong") return;
        let event: LiveEvent;
        try {
          event = JSON.parse(String(message.data));
        } catch {
          return;
        }
        for (const queryKey of keys[event.t] ?? []) void queryClient.invalidateQueries({ queryKey });
      };
      socket.onclose = () => {
        clearInterval(ping);
        setConnected(false);
        if (stopped) return;
        attempt++;
        retry = setTimeout(open, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 5)) * (0.5 + Math.random() / 2));
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    };
  }, [workspaceId, trpc, queryClient]);

  return <LiveContext.Provider value={{ connected }}>{children}</LiveContext.Provider>;
}

export function useLiveConnected() {
  return useContext(LiveContext).connected;
}

/** Poll only while live updates are down; `ms` is the fallback interval. */
export function usePollInterval(ms: number): number | false {
  return useLiveConnected() ? false : ms;
}
