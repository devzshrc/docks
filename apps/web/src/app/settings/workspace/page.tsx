"use client";
import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";

import { PersonAvatar } from "@/components/person-avatar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCopy, IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/react";

function NameCard({
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
            {rename.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ROLE_LABEL: Record<string, { label: string; help: string }> = {
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
const ROLE_ORDER = ["owner", "admin", "billing", "member", "viewer"] as const;

function RepoAccess({
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
            <p className="text-destructive">{save.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MembersCard({
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
                          className="bg-(--field) hover:bg-(--field-hover) h-8 rounded-lg border px-2 text-sm"
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

function TeamsCard({ workspaceId }: { workspaceId: string }) {
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

function StuckCard({
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
              {save.error.message}
            </span>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityCard({
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
          <p className="text-destructive text-sm">{set.error.message}</p>
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

function InvitesCard({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invites = useQuery(
    trpc.workspace.invites.queryOptions({ workspaceId }),
  );
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries(trpc.workspace.invites.queryFilter());

  const create = useMutation(
    trpc.workspace.createInvite.mutationOptions({
      onSuccess: (res) => {
        setLink(res.url);
        setCopied(false);
        void refresh();
      },
    }),
  );
  const revoke = useMutation(
    trpc.workspace.revokeInvite.mutationOptions({ onSuccess: refresh }),
  );
  const [email, setEmail] = useState("");
  const inviteEmail = useMutation(
    trpc.workspace.inviteByEmail.mutationOptions({
      onSuccess: () => {
        setEmail("");
        void refresh();
      },
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>
          Email invites work only for that address. Links work for anyone. Both
          expire after 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) inviteEmail.mutate({ workspaceId, email });
          }}
        >
          <Input
            type="email"
            placeholder="teammate@company.com"
            aria-label="Email to invite"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              inviteEmail.reset();
            }}
          />
          <Button type="submit" disabled={inviteEmail.isPending}>
            Send invite
          </Button>
        </form>
        {inviteEmail.isSuccess && (
          <p className="text-sm text-emerald-600">Invite sent.</p>
        )}
        {inviteEmail.error && (
          <p className="text-destructive text-sm">
            {inviteEmail.error.message}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Or share a link anyone can use:
        </p>
        <Button
          variant="outline"
          onClick={() => create.mutate({ workspaceId })}
          disabled={create.isPending}
        >
          Create invite link
        </Button>
        {create.error && (
          <p className="text-destructive text-sm">{create.error.message}</p>
        )}
        {link && (
          <div className="flex max-w-xl gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {}
              }}
            >
              <IconCopy className="size-4" aria-hidden />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
        {link && (
          <p className="text-muted-foreground text-xs">
            This is the only time the full link is shown. Create a new one if
            you lose it.
          </p>
        )}
        {invites.data && invites.data.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {invites.data.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span>
                  {inv.email ? (
                    <span className="font-medium">{inv.email} · </span>
                  ) : (
                    "Link · "
                  )}
                  Created by {inv.createdBy}
                  <span className="text-muted-foreground">
                    {" "}
                    · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    revoke.mutate({ workspaceId, inviteId: inv.id })
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DataCard({
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
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Data</CardTitle>
        <CardDescription>
          Export everything this workspace stores, or delete the workspace and
          all its data.
        </CardDescription>
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
              {exportData.error.message}
            </p>
          )}
        </div>
        {canDelete && (
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
              <p className="text-destructive text-sm">{remove.error.message}</p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Content() {
  const { workspace, isPending } = useWorkspace();
  const settings = useWorkspaceSettings(workspace?.id);
  if (isPending || (workspace && settings.isPending)) return null;
  if (!workspace) {
    return (
      <p className="text-muted-foreground text-sm">
        You aren&apos;t in a workspace yet.{" "}
        <Link href="/settings/integrations" className="underline">
          Create one
        </Link>{" "}
        or ask a teammate for an invite link.
      </p>
    );
  }
  if (settings.error)
    return <p className="text-destructive text-sm">{settings.error.message}</p>;
  const can = settings.data!.can;
  return (
    <div className="flex flex-col gap-6">
      <NameCard
        workspaceId={workspace.id}
        name={workspace.name}
        isOwner={can["workspace.manage"]}
      />
      <MembersCard
        workspaceId={workspace.id}
        canManage={can["members.manage"]}
        myRole={settings.data!.role}
      />
      {can["members.manage"] && <InvitesCard workspaceId={workspace.id} />}
      {can["members.manage"] && <TeamsCard workspaceId={workspace.id} />}
      {can["workspace.manage"] && (
        <StuckCard
          workspaceId={workspace.id}
          hours={settings.data!.stuckHours}
        />
      )}
      {can["workspace.manage"] && (
        <SecurityCard
          workspaceId={workspace.id}
          require2fa={settings.data!.require2fa}
        />
      )}
      {can["workspace.manage"] && (
        <DataCard
          workspaceId={workspace.id}
          name={workspace.name}
          canDelete={can["workspace.delete"]}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <AppShell
      title="Workspace"
      description="Name, members, invites, teams and security settings."
    >
      <Content />
    </AppShell>
  );
}
