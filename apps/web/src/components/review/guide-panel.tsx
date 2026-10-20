"use client";

import type { GuideState } from "@docks/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconRefresh, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { type GuideFeedback, VoteButtons } from "./guide-vote";
import { SideSection } from "./side-section";

/** Summary and numbered tour steps; clicking a step filters the diff (§5.3). */
export function GuidePanel({
  repo,
  number,
  state,
  activeStep,
  onStepChange,
  canAct = true,
  feedback,
}: {
  repo: string;
  number: number;
  state: GuideState | undefined;
  activeStep: number | null;
  onStepChange: (step: number | null) => void;
  canAct?: boolean;
  /** Thumbs on the summary and steps; only for AI guides. */
  feedback?: GuideFeedback | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const regenerate = useMutation(
    trpc.review.regenerateGuide.mutationOptions({
      onSuccess: (next) => {
        setError(undefined);
        onStepChange(null);
        queryClient.setQueryData(
          trpc.review.guide.queryKey({ repo, number }),
          next,
        );
      },
      onError: (e) => setError(e.message),
    }),
  );

  if (!state || state.status === "pending") {
    return (
      <section className="grid gap-2" aria-busy="true">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <IconSparkles className="size-4" aria-hidden />
          Building the review guide…
        </p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </section>
    );
  }

  const { guide } = state;
  const ai = guide.source === "ai";
  const row = (active: boolean) =>
    cn(
      "group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
      active ? "bg-card shadow-control" : "hover:bg-muted/60",
    );

  return (
    <>
      <SideSection
        label={
          <span className="inline-flex items-center gap-1.5">
            {ai && <IconSparkles className="size-3.5 text-primary" aria-hidden />}
            {ai ? "AI summary" : "Summary"}
          </span>
        }
        action={
          ai &&
          canAct && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Regenerate summary and review path"
              title="Regenerate"
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate({ repo, number })}
            >
              <IconRefresh className={cn("size-3.5", regenerate.isPending && "animate-spin")} aria-hidden />
            </Button>
          )
        }
      >
        <p className="text-sm leading-relaxed text-pretty">{guide.summary}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {ai && state.model && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-subtle">By {state.model} · check it against the diff.</p>
            {feedback && <VoteButtons feedback={feedback} item="summary" label="summary" />}
          </div>
        )}
      </SideSection>

      {guide.steps.length > 0 && (
        <SideSection
          label="Review path"
          action={<span className="text-[11px] text-subtle tabular-nums">{guide.steps.length} steps</span>}
        >
          <ol className="-mx-1 grid gap-0.5">
            <li>
              <button type="button" onClick={() => onStepChange(null)} aria-pressed={activeStep === null} className={row(activeStep === null)}>
                <span
                  className={cn(
                    "mt-px grid size-5 shrink-0 place-items-center rounded-full text-[10px] transition-colors",
                    activeStep === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  ∗
                </span>
                <span className="font-medium">All files</span>
              </button>
            </li>
            {guide.steps.map((step, i) => {
              const on = activeStep === i;
              return (
                <li key={i} className="group/step relative">
                  {ai && feedback && (
                    <span
                      className={cn(
                        "absolute right-1.5 bottom-1.5 z-10 transition-opacity",
                        feedback.votes[`step:${i}`] ? "opacity-100" : "opacity-0 group-hover/step:opacity-100 group-focus-within/step:opacity-100",
                      )}
                    >
                      <VoteButtons feedback={feedback} item={`step:${i}`} label={step.title} />
                    </span>
                  )}
                  <button type="button" onClick={() => onStepChange(on ? null : i)} aria-pressed={on} className={row(on)}>
                    <span
                      className={cn(
                        "mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-medium tabular-nums transition-colors",
                        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{step.title}</span>
                        <span className="shrink-0 text-[11px] text-subtle tabular-nums">
                          {step.files.length} file{step.files.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      {step.why && (
                        <span className={cn("text-xs leading-relaxed text-muted-foreground", !on && "line-clamp-2")}>{step.why}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </SideSection>
      )}
    </>
  );
}
