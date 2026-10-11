"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/react";

const partOfDay = (h: number) =>
  h < 5
    ? "Good evening"
    : h < 12
      ? "Good morning"
      : h < 17
        ? "Good afternoon"
        : "Good evening";

function waited(iso: string) {
  const h = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000),
  );
  return h < 24
    ? `${h} hour${h === 1 ? "" : "s"}`
    : `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? "" : "s"}`;
}

/** A personal line above the board: who it is for, what is waiting on them, and what changed since their last visit. */
export function Greeting({
  workspaceId,
  cards,
}: {
  workspaceId: string;
  cards: { updatedAt: string }[];
}) {
  const trpc = useTRPC();
  const { data: session } = useSession();
  // Same query as the sidebar badge, so this is usually already cached.
  const waiting = useQuery({
    ...trpc.review.board.queryOptions({
      workspaceId,
      filters: { sort: "oldest", waitingOnMe: true },
    }),
    staleTime: 60_000,
  });

  // The previous visit is read once, then this visit is remembered for next time.
  const [lastVisit, setLastVisit] = useState<number | null | undefined>(
    undefined,
  );
  useEffect(() => {
    const key = `docks:last-visit:${workspaceId}`;
    try {
      const prev = Number(localStorage.getItem(key));
      setLastVisit(prev > 0 ? prev : null);
      localStorage.setItem(key, String(Date.now()));
    } catch {
      setLastVisit(null);
    }
  }, [workspaceId]);

  const first = session?.user.name?.split(" ")[0];
  if (!first || lastVisit === undefined) return null;

  const mine = waiting.data?.cards ?? [];
  const changed = lastVisit
    ? cards.filter((c) => new Date(c.updatedAt).getTime() > lastVisit).length
    : 0;
  const oldest = mine[0];

  return (
    <header className="space-y-2">
      <h2 className="text-title-1-medium text-text-primary">
        {partOfDay(new Date().getHours())}, {first}
      </h2>
      <p className="text-body-2-regular text-text-secondary">
        {waiting.isPending
          ? " "
          : mine.length
            ? `${mine.length} review${mine.length === 1 ? " is" : "s are"} waiting on you${oldest ? `, the oldest for ${waited(oldest.updatedAt)}` : ""}.`
            : "Nothing is waiting on you right now."}
        {changed > 0 &&
          ` ${changed} pull request${changed === 1 ? "" : "s"} changed since your last visit.`}
        {lastVisit === null && !waiting.isPending && " Welcome to your board."}
      </p>
    </header>
  );
}
