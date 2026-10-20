"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { StarterRules } from "@/components/setup/starter-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { errorMessage } from "@/lib/error-message";
import { useTRPC } from "@/trpc/react";

const EXAMPLE = `tiers:
  core:   ["services/*/src/**"]
  config: ["infra/**"]
  test:   ["**/testdata/**"]
  noise:  ["**/*.pb.go", "web/public/"]
checklist:
  - paths: ["**/migrations/**"]
    question: "Does this migration handle existing rows?"`;

/** Read-only view of `.github/docks.yml`: rules in effect, errors, and a path tester. Edits happen in the repo. */
export function RepoRulesSheet({
  repo,
  canManage,
}: {
  repo: { id: number; fullName: string };
  canManage: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [testPath, setTestPath] = useState("");
  const input = { repoId: repo.id, testPath: testPath.trim() || undefined };
  const state = useQuery(
    trpc.workspace.repoRules.queryOptions(input, { enabled: open }),
  );
  const refresh = useMutation(
    trpc.workspace.refreshRepoRules.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.workspace.repoRules.pathKey(),
        }),
    }),
  );
  const d = state.data;
  const tiers = d?.rules
    ? Object.entries(d.rules.tiers).filter(([, globs]) => globs?.length)
    : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost">
          Review rules
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Review rules</SheetTitle>
          <SheetDescription>
            {repo.fullName}: file ranking and extra checklist questions come
            from <code className="font-code">.github/docks.yml</code> on the
            default branch. Edit it in the repo; Docks re-reads it on the next
            PR sync, or now with Refresh.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6 text-sm">
          {state.isPending ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : state.error ? (
            <p className="text-destructive">{errorMessage(state.error)}</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-muted-foreground">
                  {d?.found
                    ? "Rules file found."
                    : "No rules file: built-in ranking applies."}
                  {d?.checkedAt && (
                    <> Checked {new Date(d.checkedAt).toLocaleString()}.</>
                  )}
                </p>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={refresh.isPending}
                    onClick={() => refresh.mutate({ repoId: repo.id })}
                  >
                    {refresh.isPending ? "Refreshing…" : "Refresh"}
                  </Button>
                )}
              </div>
              {refresh.error && (
                <p className="text-destructive">
                  {errorMessage(refresh.error)}
                </p>
              )}
              {d?.error && (
                <p className="rounded-md bg-destructive/10 p-3 text-destructive">
                  The file is invalid, so the last valid rules stay in effect:{" "}
                  {d.error}
                </p>
              )}

              {d?.rules ? (
                <section className="space-y-2">
                  <h3 className="font-medium">In effect</h3>
                  {tiers.length === 0 && d.rules.checklist.length === 0 && (
                    <p className="text-muted-foreground">
                      The file has no rules.
                    </p>
                  )}
                  <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
                    {tiers.map(([tier, globs]) => (
                      <div key={tier} className="contents">
                        <dt className="text-muted-foreground capitalize">
                          {tier}
                        </dt>
                        <dd className="font-code text-xs">
                          {globs!.join(", ")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {d.rules.checklist.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5">
                      {d.rules.checklist.map((c, i) => (
                        <li key={i}>
                          {c.question}{" "}
                          <span className="font-code text-xs text-muted-foreground">
                            ({c.paths.join(", ")})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : (
                <section className="space-y-2">
                  <h3 className="font-medium">Example</h3>
                  <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-code text-xs">
                    {EXAMPLE}
                  </pre>
                </section>
              )}

              {canManage && !d?.found && <StarterRules repoId={repo.id} />}

              <section className="space-y-2">
                <h3 className="font-medium">Test a path</h3>
                <Input
                  aria-label="Path to test"
                  placeholder="services/auth/src/login.ts"
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                />
                {d?.testTier && (
                  <p>
                    Ranked as <span className="font-medium">{d.testTier}</span>.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
