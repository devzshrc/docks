"use client";

import { IconGitPullRequest } from "@tabler/icons-react";
import Link from "next/link";

import { GhAvatar } from "@/components/gh-avatar";
import {
  age,
  LabelChip,
  STATUS_LABEL,
  type IssueItem,
  type IssueStatus,
} from "@/components/issues/shared";
import { Frame, FrameHeader, FrameTitle } from "@/components/ui-compat/frame";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const LANES: IssueStatus[] = ["todo", "in_progress", "in_review", "done"];
const HINT: Record<IssueStatus, string> = {
  todo: "Open, nobody on it",
  in_progress: "Assigned, or a draft PR exists",
  in_review: "A PR is open for review",
  done: "Closed in the last 2 weeks",
};

/** Status comes from GitHub (assignee, linked PR, closed), so there is nothing to drag. */
export function IssueBoard({
  columns,
  loading,
}: {
  columns: Record<IssueStatus, IssueItem[]> | undefined;
  loading: boolean;
}) {
  return (
    <div className="-mx-5 flex snap-x gap-5 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {LANES.map((lane) => {
        const items = columns?.[lane] ?? [];
        return (
          <Frame
            key={lane}
            aria-label={STATUS_LABEL[lane]}
            spacing="sm"
            className="min-h-[26rem] w-[80vw] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none"
          >
            <FrameHeader>
              <div className="flex items-center justify-between gap-2">
                <FrameTitle className="font-medium">
                  {STATUS_LABEL[lane]}
                </FrameTitle>
                {columns && (
                  <Badge variant="outline" className="bg-card tabular-nums">
                    {items.length}
                  </Badge>
                )}
              </div>
              <p className="text-text-3 mt-0.5 text-xs">{HINT[lane]}</p>
            </FrameHeader>
            <div className="stagger flex flex-col gap-1.5">
              {loading &&
                [0, 1].map((n) => (
                  <Skeleton key={n} className="h-24 w-full rounded-md" />
                ))}
              {!loading && items.length === 0 && (
                // An empty lane says so plainly; skeleton bars here read as "still loading".
                <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
                  Nothing here
                </p>
              )}
              {items.map((i) => {
                const pr =
                  i.prs.find((p) => p.state === "open") ??
                  i.prs.find((p) => p.state === "merged");
                return (
                  <article
                    key={`${i.repo}#${i.number}`}
                    className="bg-card surface-hover relative rounded-md border p-3.5 text-sm shadow-xs"
                  >
                    <Link
                      href={`/issues/${i.repo}/${i.number}`}
                      className="block outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                    >
                      <div className="text-muted-foreground truncate font-mono text-xs">
                        {i.repo}
                      </div>
                      <div className="mt-1 line-clamp-2 leading-snug font-medium">
                        <span className="text-text-3 font-normal">
                          #{i.number}
                        </span>{" "}
                        {i.title}
                      </div>
                    </Link>
                    {i.labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {i.labels.slice(0, 3).map((l) => (
                          <LabelChip key={l.name} {...l} />
                        ))}
                      </div>
                    )}
                    <div className="text-muted-foreground mt-2.5 flex items-center gap-2 text-xs">
                      <span className="flex -space-x-1.5">
                        {i.assignees.slice(0, 3).map((a) => (
                          <GhAvatar
                            key={a}
                            login={a}
                            className="ring-card size-5 ring-2"
                          />
                        ))}
                      </span>
                      {pr && (
                        <span className="flex items-center gap-1">
                          <IconGitPullRequest
                            className="size-3.5"
                            aria-hidden
                          />
                          #{pr.number}
                        </span>
                      )}
                      <span className="ml-auto tabular-nums">
                        {age(i.updatedAt)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </Frame>
        );
      })}
    </div>
  );
}
