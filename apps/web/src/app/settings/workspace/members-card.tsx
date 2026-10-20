"use client";

import { errorMessage } from "@/lib/error-message";
import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { Button as ShadcnButton } from "@/components/ui/button";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";
import { PersonAvatar } from "@/components/person-avatar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/react";

/** Members, roles and per-person repository access. */
export const ROLE_LABEL: Record<string, { label: string; help: string }> = {
  owner: {
    label: "Owner",
    help: "Everything, including billing and deleting the workspace",
  },
  admin: {
    label: "Admin",
    help: "Members, repositories, integrations and settings; not billing",
  },
  billing: { label: "Billing", help: "Plan and payment, plus reviewing" },
  member: { label: "Member", help: "Review, comment, approve and merge" },
  viewer: { label: "Viewer", help: "Read-only: board, diffs and guides" },
};
export const ROLE_ORDER = ["owner", "admin", "billing", "member", "viewer"] as const;

export function RepoAccess({
  workspaceId,
  userId,
  repoIds,
}: {
  workspaceId: string;
  userId: string;
  repoIds: number[] | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const repos = useQuery(trpc.workspace.repos.queryOptions({ workspaceId }));
  const [open, setOpen] = useState(false);
  const save = useMutation(
    trpc.workspace.setMemberRepos.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.workspace.members.queryFilter()),
    }),
  );
  const all = repos.data ?? [];
  const selected = new Set(repoIds ?? all.map((r) => r.id));

  return (
    <div className="text-sm">
      <ShadcnButton
        variant="ghost"
        type="button"
        className="underline underline-offset-4"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {repoIds === null
          ? "All repositories"
          : `${repoIds.length} of ${all.length}`}
      </ShadcnButton>
      {open && (
        <div className="mt-2 space-y-1 rounded-md border p-2">
          {all.map((r) => (
            <label key={r.id} className="flex items-center gap-2">
              <ShadcnCheckbox
                className="size-4"
                checked={selected.has(r.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(r.id);
                  else next.delete(r.id);
                  // Everything ticked = no restriction, so new repos are included automatically.
                  save.mutate({
                    workspaceId,
                    userId,
                    repoIds: next.size === all.length ? null : [...next],
                  });
                }}
              />
              <span className="font-mono text-xs">{r.fullName}</span>
            </label>
          ))}
          {save.error && (
            <p className="text-destructive">{errorMessage(save.error)}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function MembersCard({
  workspaceId,
  canManage,
  myRole,
}: {
  workspaceId: string;
  canManage: boolean;
  myRole: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const members = useQuery(
    trpc.workspace.members.queryOptions({ workspaceId }),
  );
  const [error, setError] = useState<string>();
  const refresh = () =>
    queryClient.invalidateQueries(trpc.workspace.members.queryFilter());
  const onError = (e: { message: string }) => setError(e.message);

  const remove = useMutation(
    trpc.workspace.removeMember.mutationOptions({
      onSuccess: async (_d, vars) => {
        if (vars.userId === session?.user.id) {
          await queryClient.invalidateQueries(
            trpc.workspace.list.queryFilter(),
          );
          router.push("/review");
        } else {
          await refresh();
        }
      },
      onError,
    }),
  );
  const setRole = useMutation(
    trpc.workspace.setRole.mutationOptions({ onSuccess: refresh, onError }),
  );
  const transfer = useMutation(
    trpc.workspace.transferOwnership.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
        await queryClient.invalidateQueries(
          trpc.workspace.settings.queryFilter(),
        );
        await refresh();
      },
      onError,
    }),
  );
  const isOwner = myRole === "owner";
  // Admins can't hand out or take away "owner".
  const assignable = ROLE_ORDER.filter((r) => isOwner || r !== "owner");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          People only see repositories they can also see on GitHub.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>GitHub</TableHead>
                <TableHead className="w-36">Role</TableHead>
                {canManage && <TableHead>Repositories</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data?.map((m) => {
                const me = m.userId === session?.user.id;
                const editable =
                  canManage && !me && (isOwner || m.role !== "owner");
                return (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PersonAvatar
                          seed={m.userId}
                          name={m.name}
                          githubLogin={m.githubLogin}
                          className="size-8"
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/people/${m.userId}`}
                            className="font-medium hover:underline"
                          >
                            {m.name}
                          </Link>{" "}
                          {me && (
                            <span className="text-muted-foreground">(you)</span>
                          )}
                          <div className="text-muted-foreground text-xs">
                            {m.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.githubLogin ?? (
                        <span className="text-muted-foreground">
                          Not connected
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <ShadcnSelect
                          className="bg-(--field) hover:bg-(--field-hover) h-8 rounded-md border px-2 text-sm"
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          title={ROLE_LABEL[m.role]?.help}
                          onChange={(e) => {
                            setError(undefined);
                            setRole.mutate({
                              workspaceId,
                              userId: m.userId,
                              role: e.target
                                .value as (typeof ROLE_ORDER)[number],
                            });
                          }}
                        >
                          {assignable.map((r) => (
                            <option
                              key={r}
                              value={r}
                              title={ROLE_LABEL[r]!.help}
                            >
                              {ROLE_LABEL[r]!.label}
                            </option>
                          ))}
                        </ShadcnSelect>
                      ) : (
                        <Badge
                          variant={m.role === "owner" ? "default" : "outline"}
                          title={ROLE_LABEL[m.role]?.help}
                        >
                          {ROLE_LABEL[m.role]?.label ?? m.role}
                        </Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {m.role === "owner" ? (
                          <span className="text-muted-foreground text-sm">
                            All repositories
                          </span>
                        ) : (
                          <RepoAccess
                            workspaceId={workspaceId}
                            userId={m.userId}
                            repoIds={m.repoIds}
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="w-10 text-right">
                      {((isOwner && !me && m.role !== "owner") ||
                        editable ||
                        me) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Actions for ${m.name}`}
                            >
                              <IconDots className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem asChild>
                              <Link href={`/people/${m.userId}`}>
                                View profile
                              </Link>
                            </DropdownMenuItem>
                            {isOwner && !me && m.role !== "owner" && (
                              <DropdownMenuItem
                                disabled={transfer.isPending}
                                onSelect={() => {
                                  setError(undefined);
                                  if (
                                    confirm(
                                      `Make ${m.name} the owner? You'll become an admin.`,
                                    )
                                  ) {
                                    transfer.mutate({
                                      workspaceId,
                                      userId: m.userId,
                                    });
                                  }
                                }}
                              >
                                Make owner
                              </DropdownMenuItem>
                            )}
                            {(editable || me) && (
                              <DropdownMenuItem
                                className="text-destructive"
                                disabled={remove.isPending}
                                onSelect={() => {
                                  setError(undefined);
                                  if (
                                    confirm(
                                      me
                                        ? "Leave this workspace?"
                                        : `Remove ${m.name}?`,
                                    )
                                  ) {
                                    remove.mutate({
                                      workspaceId,
                                      userId: m.userId,
                                    });
                                  }
                                }}
                              >
                                {me
                                  ? "Leave workspace"
                                  : "Remove from workspace"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <ul className="text-muted-foreground grid gap-1 pt-2 text-xs sm:grid-cols-2">
          {ROLE_ORDER.map((r) => (
            <li key={r}>
              <span className="text-foreground font-medium">
                {ROLE_LABEL[r]!.label}:
              </span>{" "}
              {ROLE_LABEL[r]!.help}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
