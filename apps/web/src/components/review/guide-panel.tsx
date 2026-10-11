"use client";
import { Button as ShadcnButton } from "@/components/ui/button";

import type { GuideState } from "@docks/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconRefresh, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

/** Summary and numbered tour steps; clicking a step filters the diff (§5.3). */
export function GuidePanel({
  repo,
  number,
  state,
  activeStep,
  onStepChange,
  canAct = true,
}: {
  repo: string;
  number: number;
  state: GuideState | undefined;
  activeStep: number | null;
  onStepChange: (step: number | null) => void;
  canAct?: boolean;
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
      <section
        className="space-y-2 bg-card rounded-lg border shadow-xs p-4"
        aria-busy="true"
      >
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

  return (
    <section className="space-y-4 text-body-2-regular">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm">
          {ai && (
            <IconSparkles
              className="text-muted-foreground mr-1.5 inline size-4"
              aria-label="AI summary"
            />
          )}
          {guide.summary}
        </p>
        {ai && canAct && (
          <Button
            size="sm"
            variant="ghost"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate({ repo, number })}
          >
            <IconRefresh className="size-4" aria-hidden />
            Regenerate
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}

      {guide.steps.length > 0 && (
        <ol className="grid auto-rows-fr gap-2">
          <li className="h-full">
            <ShadcnButton
              variant="row"
              size="none"
              type="button"
              onClick={() => onStepChange(null)}
              className={cn(
                "bg-muted/40 hover:bg-muted/70 flex h-full w-full flex-col items-start justify-start gap-1 rounded-lg px-3.5 py-3 text-left text-sm transition-colors dark:hover:bg-muted/70",
                activeStep === null &&
                  "bg-primary/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_50%,transparent)] hover:bg-primary/15 dark:hover:bg-primary/15",
              )}
            >
              <span className="font-medium">All files</span>
              <span className="text-muted-foreground block text-xs">
                Show the full diff.
              </span>
            </ShadcnButton>
          </li>
          {guide.steps.map((step, i) => (
            <li key={i} className="h-full">
              <ShadcnButton
                variant="row"
                size="none"
                type="button"
                onClick={() => onStepChange(activeStep === i ? null : i)}
                aria-pressed={activeStep === i}
                className={cn(
                  "bg-muted/40 hover:bg-muted/70 flex h-full w-full flex-col items-start justify-start gap-1 rounded-lg px-3.5 py-3 text-left text-sm transition-colors dark:hover:bg-muted/70",
                  activeStep === i &&
                    "bg-primary/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_50%,transparent)] hover:bg-primary/15 dark:hover:bg-primary/15",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="font-medium">
                    <span className="text-primary-text mr-1.5 tabular-nums">
                      {i + 1}
                    </span>
                    {step.title}
                  </span>
                  <span className="text-subtle shrink-0 text-xs tabular-nums">
                    {step.files.length} file{step.files.length === 1 ? "" : "s"}
                  </span>
                </span>
                {step.why && (
                  <span className="text-muted-foreground block text-xs leading-relaxed">
                    {step.why}
                  </span>
                )}
              </ShadcnButton>
            </li>
          ))}
        </ol>
      )}
      {ai && state.model && (
        <p className="text-muted-foreground text-xs">
          Generated by {state.model}. Check it against the diff; it can miss
          things.
        </p>
      )}
    </section>
  );
}
