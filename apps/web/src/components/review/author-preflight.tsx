"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RiCheckLine, RiErrorWarningLine, RiTimeLine } from "@remixicon/react";
import { useState } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

type Check = { name: string; status: string; conclusion: string | null };
type Guide = { summary: string; steps: { title: string; files: string[] }[] } | null;

const BIG = 500;

/** Builds a PR description from the review guide, so authors never send a blank one. */
export function suggestedDescription(guide: NonNullable<Guide>): string {
  const steps = guide.steps.map((s, i) => `${i + 1}. **${s.title}** (${s.files.length} file${s.files.length === 1 ? "" : "s"})`);
  return [`## What this changes`, guide.summary, "", `## How to review`, ...steps].join("\n");
}

/**
 * Shown to the author on their own open PR: the things that make a review slow or bounce back,
 * caught before a reviewer spends time on them.
 */
export function AuthorPreflight({
  repo,
  number,
  pr,
  files,
  checks,
  guide,
}: {
  repo: string;
  number: number;
  pr: { body: string | null; draft: boolean; additions: number; deletions: number; url: string };
  files: { filename: string; tier: string }[];
  checks: Check[];
  guide: Guide;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const save = useMutation(
    trpc.review.updateDescription.mutationOptions({
      onSuccess: () => {
        toast("Description updated on GitHub", "success");
        void queryClient.invalidateQueries(trpc.review.get.queryFilter({ repo, number }));
      },
    }),
  );

  const failing = checks.filter((c) => c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion));
  const running = checks.filter((c) => c.status !== "completed");
  const size = pr.additions + pr.deletions;
  const core = files.filter((f) => f.tier === "core").length;
  const tests = files.filter((f) => f.tier === "test").length;
  const hasBody = (pr.body ?? "").trim().length >= 30;

  const items: { ok: boolean | "wait"; title: string; detail?: React.ReactNode }[] = [
    {
      ok: hasBody,
      title: hasBody ? "Has a description" : "Add a description",
      detail: hasBody ? undefined : guide ? (
        <Button
          size="sm"
          variant="outline"
          pending={save.isPending}
          onClick={() => save.mutate({ repo, number, body: suggestedDescription(guide) })}
        >
          Use the suggested description
        </Button>
      ) : (
        "Reviewers read the why first. A suggestion appears here once the review guide is ready."
      ),
    },
    {
      ok: failing.length ? false : running.length ? "wait" : true,
      title: failing.length
        ? `${failing.length} check${failing.length === 1 ? "" : "s"} failing`
        : running.length
          ? "Checks still running"
          : "Checks pass",
      detail: failing.length ? failing.map((c) => c.name).join(", ") : undefined,
    },
    {
      ok: size <= BIG,
      title: size <= BIG ? `Easy to review (${size} lines)` : `Large change (${size} lines)`,
      detail:
        size > BIG && guide && guide.steps.length > 1
          ? `Consider splitting along the review path: ${guide.steps.map((s) => s.title).join(" → ")}.`
          : size > BIG
            ? `PRs over ${BIG} lines take far longer to review. Consider splitting it.`
            : undefined,
    },
    {
      ok: core === 0 || tests > 0,
      title: core === 0 || tests > 0 ? "Tests included" : "No tests changed",
      detail: core > 0 && tests === 0 ? "Add or update a test, or say in the description why none is needed." : undefined,
    },
    ...(pr.draft
      ? [{ ok: false as const, title: "Still a draft", detail: <a className="underline" href={pr.url} target="_blank" rel="noreferrer">Mark it ready for review on GitHub</a> }]
      : []),
  ];
  const todo = items.filter((i) => i.ok === false).length;
  if (dismissed || (todo === 0 && !items.some((i) => i.ok === "wait"))) return null;

  return (
    <section aria-label="Before you ask for review" className="rounded-2xl border border-separator-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Before reviewers start</h2>
          <p className="text-muted-foreground text-xs">
            {todo ? `${todo} thing${todo === 1 ? "" : "s"} would make this faster to review.` : "Nearly there."} Only you see this.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.title} className="flex gap-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                i.ok === true ? "bg-success/15 text-success" : i.ok === "wait" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-600",
              )}
              aria-hidden
            >
              {i.ok === true ? <RiCheckLine className="size-3.5" /> : i.ok === "wait" ? <RiTimeLine className="size-3.5" /> : <RiErrorWarningLine className="size-3.5" />}
            </span>
            <div className="grid min-w-0 gap-1.5">
              <p className={cn(i.ok === true && "text-muted-foreground")}>{i.title}</p>
              {i.detail && <div className="text-muted-foreground text-xs">{i.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
      {save.error && <p className="text-destructive mt-2 text-sm">{errorMessage(save.error)}</p>}
    </section>
  );
}
