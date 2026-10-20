"use client";

import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/** Teams in the workspace. */
export function TeamsCard({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const teams = useQuery(trpc.people.teams.queryOptions({ workspaceId }));
  const members = useQuery(
    trpc.workspace.members.queryOptions({ workspaceId }),
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.people.teams.queryFilter()),
      queryClient.invalidateQueries(trpc.people.list.queryFilter()),
    ]);
  const onError = (e: { message: string }) => setError(e.message);
  const create = useMutation(
    trpc.people.createTeam.mutationOptions({
      onSuccess: () => {
        setName("");
        void refresh();
      },
      onError,
    }),
  );
  const rename = useMutation(
    trpc.people.renameTeam.mutationOptions({ onSuccess: refresh, onError }),
  );
  const remove = useMutation(
    trpc.people.deleteTeam.mutationOptions({ onSuccess: refresh, onError }),
  );
  const setMembers = useMutation(
    trpc.people.setTeamMembers.mutationOptions({ onSuccess: refresh, onError }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>
          Group people to filter the board, balance reviews and compare
          insights.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <ul className="space-y-3">
          {teams.data?.map((t) => (
            <li key={t.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={t.name}
                  aria-label="Team name"
                  className="h-8 max-w-xs"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== t.name)
                      rename.mutate({ teamId: t.id, name: next });
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    confirm(`Delete the ${t.name} team?`) &&
                    remove.mutate({ teamId: t.id })
                  }
                >
                  Delete
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {members.data?.map((m) => {
                  const on = t.userIds.includes(m.userId);
                  return (
                    <label
                      key={m.userId}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <ShadcnCheckbox
                        className="size-4"
                        checked={on}
                        onChange={() =>
                          setMembers.mutate({
                            teamId: t.id,
                            userIds: on
                              ? t.userIds.filter((id) => id !== m.userId)
                              : [...t.userIds, m.userId],
                          })
                        }
                      />
                      {m.name}
                    </label>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate({ workspaceId, name });
          }}
        >
          <Input
            placeholder="Frontend"
            aria-label="New team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={create.isPending}>
            Add team
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
