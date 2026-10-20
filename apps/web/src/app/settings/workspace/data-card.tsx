"use client";

import { errorMessage } from "@/lib/error-message";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/** Export, ownership transfer and deletion. */
export function DataCard({
  workspaceId,
  name,
  canDelete,
}: {
  workspaceId: string;
  name: string;
  canDelete: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const exportData = useMutation(
    trpc.workspace.export.mutationOptions({
      onSuccess: (data) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    }),
  );
  const remove = useMutation(
    trpc.workspace.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
        router.push("/review");
      },
    }),
  );

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>Download everything this workspace stores as JSON.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Button
            variant="outline"
            disabled={exportData.isPending}
            onClick={() => exportData.mutate({ workspaceId })}
          >
            Export data (JSON)
          </Button>
          {exportData.error && (
            <p className="text-destructive mt-2 text-sm">
              {errorMessage(exportData.error)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
    {/* Irreversible actions live alone, at the very end, behind a typed confirmation. */}
    {canDelete && (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Deleting the workspace removes its members, repositories, settings and history for everyone.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                confirm(
                  `Delete ${name} and all its data? This can't be undone.`,
                )
              ) {
                remove.mutate({ workspaceId, confirmName });
              }
            }}
          >
            <label htmlFor="confirm-name" className="block text-sm">
              Type <span className="font-medium">{name}</span> to delete this
              workspace
            </label>
            <div className="flex max-w-md gap-2">
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
              <Button
                type="submit"
                variant="destructive"
                disabled={confirmName !== name || remove.isPending}
              >
                Delete workspace
              </Button>
            </div>
            {remove.error && (
              <p className="text-destructive text-sm">{errorMessage(remove.error)}</p>
            )}
          </form>
        </CardContent>
      </Card>
    )}
    </>
  );
}
