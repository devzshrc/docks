"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Textarea } from "@/components/base/textarea/textarea";
import { QueryError } from "@/components/query-state";
import { errorMessage } from "@/lib/error-message";
import { useTRPC } from "@/trpc/react";

/** Suggestions are reviewed and editable before any GitHub write. */
export function StarterRules({ repoId }: { repoId: number }) {
  const trpc = useTRPC();
  const [requested, setRequested] = useState(false);
  const [edited, setEdited] = useState<string>();
  const suggestion = useQuery({
    ...trpc.workspace.starterRules.queryOptions({ repoId }),
    enabled: requested,
  });
  const create = useMutation(trpc.workspace.openRulesPr.mutationOptions());
  const content = edited ?? suggestion.data?.content ?? "";
  return (
    <section className="grid gap-3 text-body-regular text-text-secondary">
      <h3 className="text-body-medium text-text-primary">Starter rules</h3>
      <p>
        Suggest file ranking and checklist questions from this repository’s
        folders, then review the file before opening a pull request.
      </p>
      {!requested && (
        <div>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setRequested(true)}
          >
            Suggest rules
          </Button>
        </div>
      )}
      {requested && suggestion.isPending && (
        <p role="status">Reading repository folders…</p>
      )}
      {suggestion.error && (
        <QueryError
          error={suggestion.error}
          onRetry={() => void suggestion.refetch()}
        />
      )}
      {suggestion.data && !create.data && (
        <>
          {suggestion.data.truncated && (
            <p>
              GitHub returned part of the file tree. Check the suggested paths
              before continuing.
            </p>
          )}
          <Textarea
            label="Proposed .github/docks.yml"
            value={content}
            onChange={setEdited}
            rows={12}
            maxLength={20000}
          />
          <div>
            <Button
              size="small"
              disabled={create.isPending || !content.trim()}
              onClick={() => create.mutate({ repoId, content })}
            >
              {create.isPending ? "Opening…" : "Open rules pull request"}
            </Button>
          </div>
        </>
      )}
      {create.error && (
        <p role="alert" className="text-text-error-primary">
          {errorMessage(create.error)}
        </p>
      )}
      {create.data && (
        <ButtonLink
          size="small"
          variant="secondary"
          href={create.data.url}
          target="_blank"
          rel="noreferrer"
        >
          View pull request #{create.data.number}
        </ButtonLink>
      )}
    </section>
  );
}
