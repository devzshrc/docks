"use client";

import { errorMessage } from "@/lib/error-message";
import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/** Workspace name, stuck threshold and security settings. */
export function NameCard({
  workspaceId,
  name,
  isOwner,
}: {
  workspaceId: string;
  name: string;
  isOwner: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const rename = useMutation(
    trpc.workspace.rename.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace name</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) rename.mutate({ workspaceId, name: value });
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!isOwner}
            aria-label="Workspace name"
          />
          {isOwner && (
            <Button
              type="submit"
              variant="outline"
              disabled={rename.isPending || value.trim() === name}
            >
              Save
            </Button>
          )}
        </form>
        {rename.error && (
          <p className="text-destructive mt-2 text-sm">
            {errorMessage(rename.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function StuckCard({
  workspaceId,
  hours,
}: {
  workspaceId: string;
  hours: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(hours));
  const save = useMutation(
    trpc.workspace.setStuckHours.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.workspace.settings.queryFilter()),
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stuck threshold</CardTitle>
        <CardDescription>
          PRs waiting on review longer than this are flagged on the board and in
          the Slack digest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ workspaceId, hours: Number(value) });
          }}
        >
          <Input
            type="number"
            min={1}
            max={336}
            className="w-24"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Hours"
          />
          <span className="text-sm">hours</span>
          <Button
            type="submit"
            variant="outline"
            disabled={save.isPending || Number(value) === hours}
          >
            Save
          </Button>
          {save.error && (
            <span className="text-destructive text-sm">
              {errorMessage(save.error)}
            </span>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function SecurityCard({
  workspaceId,
  require2fa,
}: {
  workspaceId: string;
  require2fa: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const set = useMutation(
    trpc.workspace.setRequire2fa.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.workspace.settings.queryFilter()),
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>
          When required, members without two-factor authentication can&apos;t
          open this workspace until they turn it on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <ShadcnCheckbox
            className="size-4"
            checked={require2fa}
            disabled={set.isPending}
            onChange={(e) =>
              set.mutate({ workspaceId, required: e.target.checked })
            }
          />
          Require two-factor authentication
        </label>
        {set.error && (
          <p className="text-destructive text-sm">{errorMessage(set.error)}</p>
        )}
        <Link
          href="/settings/audit"
          className="text-sm underline underline-offset-4"
        >
          View audit log
        </Link>
      </CardContent>
    </Card>
  );
}
