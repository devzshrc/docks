"use client";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { QueryError } from "@/components/query-state";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Frame, FramePanel } from "@/components/ui-compat/frame";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTRPC } from "@/trpc/react";

function Log({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const log = useQuery(
    trpc.workspace.auditLog.queryOptions({
      workspaceId,
      action: action || undefined,
      actorId: actorId || undefined,
    }),
  );
  const members = useQuery(
    trpc.workspace.members.queryOptions({ workspaceId }),
  );

  if (log.error)
    return <QueryError error={log.error} onRetry={() => void log.refetch()} />;
  const actions = [...new Set((log.data ?? []).map((e) => e.action))].sort();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ShadcnSelect
          aria-label="Filter by action"
          className="bg-background hover:bg-muted h-8 rounded-lg border px-2 text-sm shadow-xs"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          {(action
            ? [action, ...actions.filter((a) => a !== action)]
            : actions
          ).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </ShadcnSelect>
        <ShadcnSelect
          aria-label="Filter by person"
          className="bg-background hover:bg-muted h-8 rounded-lg border px-2 text-sm shadow-xs"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
        >
          <option value="">Everyone</option>
          {members.data?.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </ShadcnSelect>
      </div>
      {log.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : log.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
      ) : (
        <Frame spacing="sm">
          <FramePanel className="px-6 py-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{new Date(e.at).toLocaleString()}</TableCell>
                    <TableCell>{e.actorName ?? "Removed user"}</TableCell>
                    <TableCell>
                      <code>{e.action}</code>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal break-words">
                      {e.target && (
                        <p>
                          {members.data?.find((m) => m.userId === e.target)
                            ?.name ?? e.target}
                        </p>
                      )}
                      {e.meta != null && (
                        <code className="text-xs">
                          {JSON.stringify(e.meta)}
                        </code>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}

function Content() {
  const { workspace, isPending } = useWorkspace();
  if (isPending) return null;
  if (!workspace)
    return (
      <p className="text-muted-foreground text-sm">
        You aren&apos;t in a workspace yet.
      </p>
    );
  return <Log workspaceId={workspace.id} />;
}

export default function Page() {
  return (
    <AppShell
      title="Audit log"
      description="Who changed what in this workspace, newest first."
    >
      <Content />
    </AppShell>
  );
}
