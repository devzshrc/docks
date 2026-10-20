"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/base/buttons/button";
import { QueryError } from "@/components/query-state";
import { useTRPC } from "@/trpc/react";
import { ExpandedFileDiff } from "./file-diff";

type Props = ComponentProps<typeof ExpandedFileDiff> & {
  lightweight: boolean;
  patchesDeferred: boolean;
  headSha: string;
};

/** Large PRs start as metadata rows: no patch requests, parsing, blame, or diff hooks until opened. */
export function FileDiff({
  lightweight,
  patchesDeferred,
  headSha,
  ...props
}: Props) {
  const { file, repo, number } = props;
  const trpc = useTRPC();
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const onHash = () => {
      try {
        if (decodeURIComponent(location.hash) === `#file-${file.filename}`)
          setOpened(true);
      } catch {}
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [file.filename]);
  const show = !lightweight || opened;
  const patch = useQuery({
    ...trpc.review.filePatch.queryOptions({
      repo,
      number,
      path: file.filename,
      headSha,
      fileSha: file.sha,
    }),
    enabled: show && patchesDeferred,
    staleTime: Infinity,
  });
  if (show && (!patchesDeferred || patch.data))
    return (
      <ExpandedFileDiff
        {...props}
        file={{
          ...file,
          patch: patchesDeferred
            ? (patch.data?.patch ?? undefined)
            : file.patch,
        }}
        initiallyExpanded={lightweight ? true : undefined}
      />
    );
  return (
    <section
      id={`file-${file.filename}`}
      className="scroll-mt-24 rounded-3xl border border-border-button-default bg-background-primary-default p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-body-regular text-text-primary">
          <p className="break-all" dir="ltr">
            {file.filename}
          </p>
          <p className="text-body-2-regular text-text-secondary">
            {file.tier} · +{file.additions} −{file.deletions}
            {file.viewed ? " · Viewed" : ""}
          </p>
        </div>
        <Button
          size="small"
          variant="secondary"
          disabled={show && patch.isPending}
          onClick={() => setOpened(true)}
        >
          {show && patch.isPending ? "Loading diff…" : "Open diff"}
        </Button>
      </div>
      {show && patch.error && (
        <QueryError error={patch.error} onRetry={() => void patch.refetch()} />
      )}
    </section>
  );
}
