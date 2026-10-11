"use client";
import { Button as ShadcnButton } from "@/components/ui/button";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, CircleIcon, LoaderCircleIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace";
import { useSession } from "@/lib/auth-client";
import { optimistic } from "@/lib/optimistic";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

const EASE = [0.22, 1, 0.36, 1] as const;
const FINALE_MS = 400;

type Repo = {
  id: number;
  fullName: string;
  enabled: boolean;
  accessible: boolean;
  suspended: Date | string | null;
  installation: string;
};
const usable = (r: Repo) => r.enabled && r.accessible && !r.suspended;

/**
 * Shows onboarding until the board has something to show, then plays a short "all set" beat and
 * dissolves into the page. People who are already set up never see it.
 */
export function OnboardingGate({
  children,
}: {
  children: (workspaceId: string) => ReactNode;
}) {
  const trpc = useTRPC();
  const reduceMotion = useReducedMotion();
  const { workspace, isPending } = useWorkspace();
  const repos = useQuery({
    ...trpc.workspace.repos.queryOptions({ workspaceId: workspace?.id ?? "" }),
    enabled: Boolean(workspace),
    // While setting up, pick up changes made elsewhere (an admin installing the app, a background sync).
    refetchInterval: (q) =>
      (q.state.data as Repo[] | undefined)?.some(usable) ? false : 5_000,
  });
  const account = useQuery(trpc.integration.githubAccount.queryOptions());

  // Repos that were already switched on when we arrived don't need a "Continue" click.
  const initiallyEnabled = useRef<boolean | null>(null);
  if (initiallyEnabled.current === null && repos.data)
    initiallyEnabled.current = (repos.data as Repo[]).some((r) => r.enabled);
  const [reposConfirmed, setReposConfirmed] = useState(false);

  const list = (repos.data ?? []) as Repo[];
  const ready =
    Boolean(workspace) &&
    list.some(usable) &&
    (reposConfirmed || Boolean(initiallyEnabled.current));

  // Remembered for the tab, so the finale still plays after a GitHub redirect (install, account link) reloads the page.
  const shown = useRef<boolean | null>(null);
  if (shown.current === null) shown.current = readFlag();
  const [finished, setFinished] = useState(false);

  const loading =
    isPending || (workspace && repos.isPending) || account.isPending;
  if (loading) return null;

  const showApp = ready && (!shown.current || finished);
  if (!showApp && !shown.current) {
    shown.current = true;
    writeFlag(true);
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showApp ? (
        <motion.div
          key="app"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="flex min-w-0 flex-col gap-8"
        >
          {children(workspace!.id)}
        </motion.div>
      ) : (
        <Onboarding
          key="onboarding"
          workspaceId={workspace?.id}
          repos={list}
          account={account.data ?? null}
          reposConfirmed={reposConfirmed || Boolean(initiallyEnabled.current)}
          onConfirmRepos={() => setReposConfirmed(true)}
          complete={ready}
          onFinished={() => {
            writeFlag(false);
            setFinished(true);
          }}
        />
      )}
    </AnimatePresence>
  );
}

const FLAG = "docks:onboarding";
function readFlag() {
  try {
    return (
      typeof window !== "undefined" && sessionStorage.getItem(FLAG) === "1"
    );
  } catch {
    return false;
  }
}
function writeFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FLAG, "1");
    else sessionStorage.removeItem(FLAG);
  } catch {}
}

type StepId = "workspace" | "github" | "repos" | "account";
const STEPS: { id: StepId; label: string }[] = [
  { id: "workspace", label: "Create your workspace" },
  { id: "github", label: "Connect GitHub" },
  { id: "repos", label: "Choose repositories" },
  { id: "account", label: "Link your GitHub account" },
];

function Onboarding({
  workspaceId,
  repos,
  account,
  reposConfirmed,
  onConfirmRepos,
  complete,
  onFinished,
}: {
  workspaceId: string | undefined;
  repos: Repo[];
  account: { login: string | null; connectUrl: string | null } | null;
  reposConfirmed: boolean;
  onConfirmRepos: () => void;
  complete: boolean;
  onFinished: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const settings = useWorkspaceSettings(workspaceId);
  const can = settings.data?.can;

  const installed = repos.length > 0 && repos.some((r) => !r.suspended);
  const enabled = repos.filter((r) => r.enabled);
  const done: Record<StepId, boolean> = {
    workspace: Boolean(workspaceId),
    github: installed,
    repos: enabled.length > 0 && reposConfirmed,
    account: Boolean(account?.login),
  };
  const current = complete
    ? null
    : (STEPS.find((s) => !done[s.id])?.id ?? null);
  const count = complete
    ? STEPS.length
    : STEPS.filter((s) => done[s.id]).length;

  // Everything is done but the board still can't see a repo: this person's GitHub access is still syncing.
  const syncing = !complete && current === null;

  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(onFinished, reduceMotion ? 0 : FINALE_MS);
    return () => clearTimeout(t);
  }, [complete, onFinished, reduceMotion]);

  return (
    <motion.section
      data-onboarding
      aria-labelledby="onboarding-title"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: -8,

              transition: { duration: 0.18, ease: EASE },
            }
      }
      transition={{ duration: 0.18, ease: EASE }}
      className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-separator-border bg-background-primary-default p-6 sm:p-8"
    >
      <header className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Setup
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={complete ? "done" : "todo"}
            id="onboarding-title"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="text-title-1-medium text-text-primary"
          >
            {complete ? "You're all set" : "Get your review board running"}
          </motion.h2>
        </AnimatePresence>
        <p className="text-muted-foreground text-sm">
          {complete
            ? "Opening your board…"
            : "Four short steps. Open pull requests appear on the board automatically."}
        </p>
      </header>

      <ol className="flex flex-wrap gap-3" aria-label="Workspace setup">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <Badge variant={complete || done[s.id] ? "default" : "outline"}>
              {complete || done[s.id] ? "✓" : i + 1}
            </Badge>
            {s.label}
          </li>
        ))}
      </ol>

      <ol className="mt-7 space-y-1">
        {STEPS.map((s) => {
          const isDone = complete || done[s.id];
          const active = s.id === current;
          return (
            <li
              key={s.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "rounded-xl transition-colors duration-300",
                active && "bg-muted/60",
              )}
            >
              <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.span
                      key="done"
                      initial={
                        reduceMotion ? false : { scale: 0.5, opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 22,
                      }}
                      className="flex"
                    >
                      <CircleCheckIcon
                        className="text-success size-[18px]"
                        aria-hidden
                      />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="todo"
                      exit={{
                        scale: 0.6,
                        opacity: 0,
                        transition: { duration: 0.12 },
                      }}
                      className="flex"
                    >
                      <CircleIcon
                        className={cn(
                          "size-[18px]",
                          active ? "text-primary-text" : "text-text-3",
                        )}
                        aria-hidden
                      />
                    </motion.span>
                  )}
                </AnimatePresence>
                <span
                  className={cn(
                    isDone
                      ? "text-muted-foreground"
                      : active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                <span className="sr-only">
                  {isDone ? "(done)" : active ? "(current step)" : "(to do)"}
                </span>
              </div>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.div
                    key="body"
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={
                      reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                    }
                    transition={{ duration: 0.35, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-4 pl-[42px]">
                      {s.id === "workspace" && <WorkspaceStep />}
                      {s.id === "github" && workspaceId && (
                        <GithubStep
                          workspaceId={workspaceId}
                          canManage={can?.["integrations.manage"] ?? false}
                          repos={repos}
                        />
                      )}
                      {s.id === "repos" && workspaceId && (
                        <ReposStep
                          workspaceId={workspaceId}
                          canManage={can?.["repos.manage"] ?? false}
                          repos={repos}
                          onContinue={onConfirmRepos}
                        />
                      )}
                      {s.id === "account" && (
                        <AccountStep connectUrl={account?.connectUrl ?? null} />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>

      {syncing && <SyncingAccess />}
    </motion.section>
  );
}

const hint = "text-muted-foreground text-sm leading-relaxed";

function WorkspaceStep() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const first = session?.user.name?.split(" ")[0];
  const [name, setName] = useState(first ? `${first}'s team` : "");
  const create = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
    }),
  );
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate({ name: name.trim() });
      }}
    >
      <p className={hint}>
        It holds your team, repositories and settings. You can rename it later.
      </p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme engineering"
          aria-label="Workspace name"
          autoFocus
          maxLength={80}
        />
        <Button
          type="submit"
          pending={create.isPending}
          disabled={!name.trim()}
        >
          Create
        </Button>
      </div>
      {create.error && (
        <p role="alert" className="text-destructive text-sm">
          {create.error.message}
        </p>
      )}
    </form>
  );
}

const GITHUB_STATUS: Record<string, string> = {
  failed: "Couldn't link the installation. Try again, or link it below.",
  "signed-out":
    "Your session expired while you were on GitHub. Sign in and try again.",
  invalid: "GitHub sent an incomplete response. Try again.",
};

function GithubStep({
  workspaceId,
  canManage,
  repos,
}: {
  workspaceId: string;
  canManage: boolean;
  repos: Repo[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("github");
  const install = useQuery({
    ...trpc.integration.githubInstallUrl.queryOptions({
      workspaceId,
      returnTo: "onboarding",
    }),
    enabled: canManage,
  });
  const installations = useQuery({
    ...trpc.integration.githubInstallations.queryOptions({ workspaceId }),
    enabled: canManage,
  });
  const link = useMutation(
    trpc.integration.linkGithubInstallation.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.workspace.repos.queryFilter());
        void queryClient.invalidateQueries(
          trpc.integration.githubInstallations.queryFilter(),
        );
      },
    }),
  );

  // Coming back from GitHub: the status is shown once, then the URL is tidied.
  useEffect(() => {
    if (status === "connected") router.replace(pathname);
  }, [status, router, pathname]);

  if (!canManage) {
    return (
      <p className={hint}>
        Ask a workspace owner or admin to connect GitHub. This page moves on by
        itself once they do.
      </p>
    );
  }

  const suspended = repos.length > 0 && repos.every((r) => r.suspended);
  const unlinked = installations.data?.filter((i) => !i.linked) ?? [];
  const linkedButEmpty =
    repos.length === 0 && (installations.data?.some((i) => i.linked) ?? false);

  return (
    <div className="space-y-3">
      {status && GITHUB_STATUS[status] && (
        <p role="alert" className="text-destructive text-sm">
          {GITHUB_STATUS[status]}
        </p>
      )}
      {suspended ? (
        <p className={hint}>
          The GitHub App is suspended on {repos[0]!.installation}. Unsuspend it
          in{" "}
          <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noreferrer"
            className="text-primary-text underline-offset-4 hover:underline"
          >
            GitHub settings
          </a>
          .
        </p>
      ) : linkedButEmpty ? (
        <p className={hint}>
          Docks is installed but can&apos;t see any repositories yet. Add some
          on GitHub.
        </p>
      ) : (
        <p className={hint}>
          Install the Docks app on your GitHub account or organization and pick
          the repositories to review.
        </p>
      )}
      {unlinked.length > 0 && (
        <div className="bg-card border-hairline divide-hairline divide-y rounded-lg border">
          {unlinked.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span>
                Already installed on{" "}
                <span className="font-medium">{i.login}</span>
              </span>
              <Button
                size="sm"
                pending={
                  link.isPending && link.variables?.installationId === i.id
                }
                onClick={() =>
                  link.mutate({ workspaceId, installationId: i.id })
                }
              >
                Link
              </Button>
            </div>
          ))}
        </div>
      )}
      {link.error && (
        <p role="alert" className="text-destructive text-sm">
          {link.error.message}
        </p>
      )}
      <Button
        asChild
        variant={unlinked.length ? "secondary" : "default"}
        disabled={!install.data}
      >
        <a href={install.data?.url}>
          {linkedButEmpty
            ? "Choose repositories on GitHub"
            : unlinked.length
              ? "Install somewhere else"
              : "Install GitHub App"}
        </a>
      </Button>
    </div>
  );
}

function ReposStep({
  workspaceId,
  canManage,
  repos,
  onContinue,
}: {
  workspaceId: string;
  canManage: boolean;
  repos: Repo[];
  onContinue: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const set = useMutation(
    trpc.workspace.setRepo.mutationOptions(
      optimistic<{ repoId: number; enabled?: boolean }>(queryClient, [
        {
          filter: trpc.workspace.repos.queryFilter(),
          patch: (rows: Repo[], v) =>
            rows.map((r) =>
              r.id === v.repoId ? { ...r, enabled: v.enabled ?? r.enabled } : r,
            ),
        },
      ]),
    ),
  );
  const enabledCount = repos.filter((r) => r.enabled).length;

  if (!canManage) {
    return (
      <p className={hint}>
        An admin chooses which repositories appear on the board. This moves on
        by itself once one is on.
      </p>
    );
  }

  const shown = repos.filter((r) =>
    r.fullName.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <p className={hint}>
        Pull requests from these show up on your board. Free workspaces track up
        to 3.
      </p>
      {repos.length > 6 && (
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter repositories"
          aria-label="Filter repositories"
        />
      )}
      <ul className="bg-card border-hairline divide-hairline max-h-64 divide-y overflow-y-auto rounded-lg border">
        {shown.map((r) => (
          <li key={r.id}>
            <label className="row-hover flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate font-mono text-[13px]">
                {r.fullName}
              </span>
              <Switch
                checked={r.enabled}
                onChange={(v) => set.mutate({ repoId: r.id, enabled: v })}
                label={`Track ${r.fullName}`}
              />
            </label>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="text-muted-foreground px-3 py-4 text-center text-sm">
            No repositories match.
          </li>
        )}
      </ul>
      {set.error && (
        <p role="alert" className="text-destructive text-sm">
          {set.error.message}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs tabular-nums">
          {enabledCount} selected
        </span>
        <Button onClick={onContinue} disabled={enabledCount === 0}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <ShadcnButton
      variant="ghost"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50",
        checked ? "bg-primary" : "bg-border-control",
      )}
    >
      <span
        className={cn(
          "bg-card size-4 rounded-full shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </ShadcnButton>
  );
}

function AccountStep({ connectUrl }: { connectUrl: string | null }) {
  return (
    <div className="space-y-3">
      <p className={hint}>
        Docks shows only the repositories you can open on GitHub, and posts your
        reviews as you.
      </p>
      {connectUrl ? (
        <Button asChild>
          <a href={connectUrl}>Link GitHub account</a>
        </Button>
      ) : (
        <p className="text-destructive text-sm">
          GitHub sign-in isn&apos;t configured on the server yet.
        </p>
      )}
    </div>
  );
}

/** Repos are on but none is visible to this person yet: refresh their GitHub access, then explain if it stays empty. */
function SyncingAccess() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sync = useMutation(
    trpc.integration.syncMyAccess.mutationOptions({
      onSettled: () =>
        queryClient.invalidateQueries(trpc.workspace.repos.queryFilter()),
    }),
  );
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    sync.mutate();
    const t = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      role="status"
      className="bg-muted/60 mt-5 flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
    >
      <LoaderCircleIcon
        className="text-muted-foreground mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      <p className="text-muted-foreground leading-relaxed">
        {slow
          ? "Your GitHub account can't see the repositories that are on. Ask for access on GitHub, or turn on one you can open."
          : "Checking which repositories you can open on GitHub…"}
      </p>
    </div>
  );
}
