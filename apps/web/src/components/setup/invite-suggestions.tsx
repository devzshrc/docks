"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { QueryError } from "@/components/query-state";
import { errorMessage } from "@/lib/error-message";
import { useTRPC } from "@/trpc/react";

/** People already reviewing or authoring here on GitHub who aren't in the workspace. */
export function InviteSuggestions({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const suggestions = useQuery(
    trpc.setup.inviteSuggestions.queryOptions({ workspaceId }),
  );
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const invite = useMutation(
    trpc.workspace.inviteByEmail.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.workspace.invites.pathKey(),
        }),
    }),
  );
  if (suggestions.isPending) return null;
  if (suggestions.error)
    return (
      <QueryError
        error={suggestions.error}
        onRetry={() => void suggestions.refetch()}
      />
    );
  if (!suggestions.data.length) return null;
  return (
    <section className="grid gap-3" aria-labelledby="suggested-heading">
      <div>
        <h2 id="suggested-heading" className="text-body-medium">
          Suggested from GitHub
        </h2>
        <p className="text-body-regular text-text-secondary">
          These people authored or reviewed pull requests here in the last 90
          days.
        </p>
      </div>
      <ul className="grid gap-2">
        {suggestions.data.map((s) => (
          <li key={s.login} className="flex flex-wrap items-center gap-2">
            <span className="w-40 truncate text-body-medium">
              {s.login}{" "}
              <span className="text-body-regular text-text-tertiary">
                · {s.activity}
              </span>
            </span>
            {sent[s.login] ? (
              <span className="text-body-regular text-text-secondary">
                Invite sent.
              </span>
            ) : (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  invite.mutate(
                    { workspaceId, email: emails[s.login] ?? "" },
                    {
                      onSuccess: () =>
                        setSent((x) => ({ ...x, [s.login]: true })),
                    },
                  );
                }}
              >
                <Input
                  type="email"
                  isRequired
                  aria-label={`Email for ${s.login}`}
                  placeholder="Their email"
                  className="max-w-64"
                  value={emails[s.login] ?? ""}
                  onChange={(value) =>
                    setEmails((x) => ({ ...x, [s.login]: value }))
                  }
                />
                <Button
                  size="small"
                  variant="secondary"
                  type="submit"
                  disabled={invite.isPending}
                >
                  Invite
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {invite.error && (
        <p className="text-body-regular text-text-error-primary">
          {errorMessage(invite.error)}
        </p>
      )}
    </section>
  );
}
