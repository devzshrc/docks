"use client";

import type { BoardCard as BoardCardData } from "@docks/api";
import { useEffect, useRef } from "react";

import { Count } from "@/components/motion";
import { BoardCard } from "@/components/review/board-card";
import { Frame, FrameHeader, FrameTitle } from "@/components/ui-compat/frame";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cx as cn } from "@/utils/cx";

const LANES = [
  { id: "needs_reviewer", title: "Needs reviewer" },
  { id: "waiting", title: "Waiting on review" },
  { id: "changes_requested", title: "Changes requested" },
  { id: "approved", title: "Approved" },
] as const;

const LANE_DOT: Record<string, string> = {
  draft: "bg-subtle",
  needs_reviewer: "bg-hue-amber",
  waiting: "bg-hue-blue",
  changes_requested: "bg-hue-red",
  approved: "bg-hue-green",
};

/** A faded card outline, so an empty lane still shows what lands in it. */
function LaneEmpty({ title }: { title: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-separator-border p-4">
      <p className="text-center text-caption-1-regular text-text-secondary">
        No pull requests in {title.toLowerCase()}
      </p>
    </div>
  );
}

/** Lanes by review state (plus Drafts when shown), with j/k keyboard movement (§5.2, M5). */
export function ReviewBoard({
  cards,
  loading,
  showDrafts,
  stuckHours,
  canAct,
}: {
  cards: BoardCardData[] | undefined;
  loading: boolean;
  showDrafts: boolean;
  stuckHours: number;
  canAct: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);

  // j / k move between cards in reading order; Enter follows the focused link.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
      )
        return;
      if (e.key !== "j" && e.key !== "k") return;
      const links = [
        ...(root.current?.querySelectorAll<HTMLAnchorElement>("a[data-card]") ??
          []),
      ];
      if (!links.length) return;
      const i = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next =
        e.key === "j" ? Math.min(i + 1, links.length - 1) : Math.max(i - 1, 0);
      links[i === -1 ? 0 : next]!.focus();
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stuck = cards?.filter((c) => c.stuck).length ?? 0;
  const lanes = [
    ...(showDrafts ? [{ id: "draft", title: "Drafts" } as const] : []),
    ...LANES,
  ];
  const inLane = (id: string) =>
    (cards ?? []).filter((c) =>
      id === "draft" ? c.draft : !c.draft && c.column === id,
    );

  return (
    <div ref={root} className="space-y-3">
      {stuck > 0 && (
        <p className="text-warning-text flex items-center gap-2 text-xs">
          <span className="bg-warning size-1.5 rounded-full" aria-hidden />
          {stuck} PR{stuck > 1 ? "s" : ""} waiting more than {stuckHours}h
        </p>
      )}
      <div
        className="flex snap-x gap-4 overflow-x-auto pb-2 md:grid md:overflow-visible"
        style={{
          gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))`,
        }}
      >
        {lanes.map((lane) => {
          const items = inLane(lane.id);
          return (
            <Frame
              key={lane.id}
              aria-label={lane.title}
              spacing="sm"
              className="min-h-80 w-[80vw] max-w-sm shrink-0 snap-start gap-3 rounded-2xl border-0 bg-background-tertiary-default p-3 shadow-none md:w-auto md:max-w-none"
            >
              <FrameHeader className="flex-row items-center justify-between gap-2 px-1 py-1">
                <FrameTitle className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      LANE_DOT[lane.id] ?? "bg-subtle",
                    )}
                  />
                  {lane.title}
                </FrameTitle>
                {cards && (
                  <Badge
                    variant="secondary"
                    className="h-[18px] min-w-6 px-1.5 text-[11px] tabular-nums"
                  >
                    <Count value={items.length} />
                  </Badge>
                )}
              </FrameHeader>
              {loading ? (
                <Skeleton className="h-28 w-full rounded-lg" />
              ) : items.length === 0 ? (
                <LaneEmpty title={lane.title} />
              ) : (
                <div className="flex flex-col gap-3">
                  {items.map((pr) => (
                    <BoardCard
                      key={`${pr.repo}#${pr.number}`}
                      pr={pr}
                      canAct={canAct}
                    />
                  ))}
                </div>
              )}
            </Frame>
          );
        })}
      </div>
    </div>
  );
}
