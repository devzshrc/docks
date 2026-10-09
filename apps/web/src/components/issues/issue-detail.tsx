"use client";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";

import {
  IconExternalLink,
  IconGitPullRequest,
  IconPencil,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { GhAvatar } from "@/components/gh-avatar";
import {
  AssigneeMenu,
  LabelMenu,
  MilestoneMenu,
} from "@/components/issues/pickers";
import {
  age,
  LabelChip,
  STATUS_LABEL,
  StateIcon,
  type Outputs,
} from "@/components/issues/shared";
import { useIssueActions } from "@/components/issues/use-issue-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/panel";
import { QueryError } from "@/components/query-state";
import { FixWithAgent } from "@/components/review/agent-handoff";
import { MarkdownPreview } from "@/components/review/markdown-preview";
import { useDraft } from "@/hooks/use-draft";
import { optimistic } from "@/lib/optimistic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/react";

type Issue = Outputs["issues"]["get"];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

function agentPrompt(i: Issue) {
  return [
    `Work on ${i.repo}#${i.number}: ${i.title}`,
    i.body.trim()
      ? `Issue description:\n${i.body.trim().slice(0, 6000)}`
      : "The issue has no description.",
    `Suggested branch: fix/${i.number}-${slug(i.title)}`,
    "Reproduce or understand the problem first, make the smallest change that resolves it, keep the existing style, run the relevant tests, and summarise what you changed.",
  ].join("\n\n");
}

const side = "text-muted-foreground text-xs font-medium";
const ghost =
  "text-muted-foreground hover:text-foreground hover:bg-hover inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors";

/** Close options, including "duplicate of #N" with suggestions from similar open issues. */
function CloseMenu({
  issue,
  onClose,
}: {
  issue: Issue;
  onClose: (
    reason: "completed" | "not_planned" | "duplicate",
    duplicateOf?: number,
  ) => void;
}) {
  const trpc = useTRPC();
  const [dup, setDup] = useState(false);
  const [num, setNum] = useState("");
  const similar = useQuery({
    ...trpc.issue.similar.queryOptions({
      repo: issue.repo,
      title: issue.title,
    }),
    enabled: dup,
  });
  const choices = (similar.data?.items ?? []).filter(
    (s) => s.number !== issue.number,
  );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Close issue
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onClose("completed")}>
            Close as completed
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onClose("not_planned")}>
            Close as not planned
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDup(true)}>
            Close as duplicate…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dup && (
        <div
          className="bg-card border-hairline fixed inset-x-4 top-24 z-50 mx-auto w-full max-w-md space-y-3 rounded-xl border p-4 shadow-lg"
          role="dialog"
          aria-label="Close as duplicate"
        >
          <p className="text-sm font-medium">Duplicate of which issue?</p>
          {choices.length > 0 && (
            <ul className="space-y-1">
              {choices.map((s) => (
                <li key={s.number}>
                  <ShadcnButton
                    variant="ghost"
                    type="button"
                    className="hover:bg-hover w-full rounded-md px-2 py-1.5 text-left text-sm"
                    onClick={() => onClose("duplicate", s.number)}
                  >
                    <span className="text-text-3">#{s.number}</span> {s.title}
                  </ShadcnButton>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(num.replace(/^#/, ""));
              if (Number.isInteger(n) && n > 0 && n !== issue.number)
                onClose("duplicate", n);
            }}
          >
            <Input
              value={num}
              onChange={(e) => setNum(e.target.value)}
              placeholder="Issue number, e.g. 42"
              aria-label="Duplicate of issue number"
              className="h-8"
            />
            <Button size="sm" type="submit" disabled={!num.trim()}>
              Close
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setDup(false)}
            >
              Cancel
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

function Related({ issue, canEdit }: { issue: Issue; canEdit: boolean }) {
  const trpc = useTRPC();
  const refs = useQuery({
    ...trpc.issue.references.queryOptions({
      repo: issue.repo,
      text: `${issue.title}\n${issue.body}`,
    }),
    enabled: canEdit && issue.body.length > 0,
    staleTime: 5 * 60_000,
  });
  const paths = refs.data?.refs.map((r) => r.path) ?? [];
  const owners = useQuery({
    ...trpc.issue.suggestAssignees.queryOptions({ repo: issue.repo, paths }),
    enabled: canEdit && paths.length > 0,
    staleTime: 5 * 60_000,
  });
  if (!paths.length) return null;
  return (
    <Panel title="Related code" description="Files this issue mentions">
      <ul className="space-y-1.5 text-xs">
        {refs.data!.refs.slice(0, 6).map((r) => (
          <li key={`${r.path}:${r.line ?? ""}`} className="truncate">
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:underline"
            >
              {r.path}
              {r.line ? `:${r.line}` : ""}
            </a>
          </li>
        ))}
      </ul>
      {owners.data && owners.data.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          <p className={side}>Likely owners</p>
          {owners.data.slice(0, 3).map((o) => (
            <div key={o.login} className="flex items-center gap-2 text-xs">
              <GhAvatar login={o.login} className="size-5" />
              <span className="font-medium">{o.login}</span>
              <span className="text-text-3 truncate">{o.reasons[0]}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function IssueDetail({
  repo,
  number,
}: {
  repo: string;
  number: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { update } = useIssueActions();
  const q = useQuery({
    ...trpc.issues.get.queryOptions({ repo, number }),
    refetchInterval: 30_000,
  });
  const account = useQuery({
    ...trpc.integration.githubAccount.queryOptions(),
    staleTime: 5 * 60_000,
  });
  const me = account.data?.login ?? null;
  const comment = useMutation(
    trpc.issues.comment.mutationOptions(
      optimistic<{ repo: string; number: number; body: string }>(queryClient, [
        {
          filter: trpc.issues.get.queryFilter({ repo, number }),
          patch: (d: Issue, v) => ({
            ...d,
            comments: [
              ...d.comments,
              {
                id: -Date.now(),
                author: me ?? "you",
                body: v.body,
                createdAt: new Date().toISOString(),
                association: null,
              },
            ],
          }),
        },
      ]),
    ),
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [editingBody, setEditingBody] = useState(false);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useDraft(
    `draft:issue-comment:${repo}#${number}`,
    "",
  );

  if (q.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  const i = q.data;
  const ref = { repo, number };
  const canEdit = i.canEdit && !i.offline;
  const patch = (
    p: Parameters<typeof update.mutate>[0]["patch"],
    extra?: { duplicateOf?: number },
  ) => update.mutate({ ...ref, patch: p, ...extra });

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  patch({ title });
                  setEditingTitle(false);
                }}
              >
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  aria-label="Issue title"
                  className="h-9 text-base"
                />
                <Button size="sm" type="submit" disabled={!title.trim()}>
                  Save
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingTitle(false)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <h1 className="text-xl leading-snug font-medium tracking-tight text-balance">
                {i.title}{" "}
                <span className="text-text-3 font-normal">#{i.number}</span>
                {canEdit && (
                  <ShadcnButton
                    variant="ghost"
                    type="button"
                    className={`${ghost} ml-1 align-middle`}
                    aria-label="Edit title"
                    onClick={() => {
                      setTitle(i.title);
                      setEditingTitle(true);
                    }}
                  >
                    <IconPencil className="size-3.5" aria-hidden />
                  </ShadcnButton>
                )}
              </h1>
            )}
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <StateIcon state={i.state} reason={i.stateReason} />
                {i.state === "open"
                  ? "Open"
                  : i.stateReason === "not_planned"
                    ? "Closed as not planned"
                    : i.stateReason === "duplicate"
                      ? "Closed as duplicate"
                      : "Closed"}
              </span>
              <span>
                {i.author} opened {age(i.createdAt)} ago
              </span>
              <Badge variant="secondary" className="">
                {STATUS_LABEL[i.status]}
              </Badge>
              {i.stale && (
                <Badge variant="secondary" className=" text-warning-text">
                  stale
                </Badge>
              )}
              <Link
                href={`/issues?repo=${i.repoId}`}
                className="font-mono hover:underline"
              >
                {i.repo}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FixWithAgent prompt={agentPrompt(i)} compact={false} />
            <Button asChild size="sm" variant="ghost">
              <a href={i.url} target="_blank" rel="noreferrer">
                <IconExternalLink className="size-3.5" aria-hidden />
                GitHub
              </a>
            </Button>
            {canEdit &&
              (i.state === "open" ? (
                <CloseMenu
                  issue={i}
                  onClose={(reason, duplicateOf) =>
                    patch(
                      { state: "closed", stateReason: reason },
                      { duplicateOf },
                    )
                  }
                />
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => patch({ state: "open" })}
                >
                  Reopen
                </Button>
              ))}
          </div>
        </div>
      </header>

      {i.offline && (
        <p
          role="status"
          className="text-warning-text bg-warning-bg border-warning-border rounded-lg border px-3 py-2 text-sm"
        >
          Couldn't reach GitHub just now, so this is the last synced copy.
          Comments and edits are unavailable until it's back.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          <Panel
            title="Description"
            bodyClassName="p-0"
            actions={
              canEdit &&
              !editingBody && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setBody(i.body);
                    setEditingBody(true);
                  }}
                >
                  Edit
                </Button>
              )
            }
          >
            {editingBody ? (
              <div className="space-y-2 p-4">
                <ShadcnTextarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  aria-label="Issue description"
                  className="bg-(--field) hover:bg-(--field-hover) w-full rounded-lg border p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => {
                      patch({ body });
                      setEditingBody(false);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingBody(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : i.body.trim() ? (
              <MarkdownPreview text={i.body} />
            ) : (
              <p className="text-muted-foreground px-5 py-6 text-sm">
                No description.
              </p>
            )}
          </Panel>

          <section aria-label="Comments" className="space-y-3">
            <h2 className="text-sm font-medium">
              Comments{" "}
              <span className="text-text-3 font-normal">
                {i.comments.length}
              </span>
            </h2>
            {i.comments.map((c) => (
              <div
                key={c.id}
                className="bg-card overflow-hidden rounded-lg border shadow-xs"
              >
                <div className="border-hairline text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs">
                  <GhAvatar login={c.author} className="size-5" />
                  <span className="text-foreground font-medium">
                    {c.author}
                  </span>
                  <span>{age(c.createdAt)} ago</span>
                </div>
                <MarkdownPreview text={c.body} />
              </div>
            ))}
            {canEdit && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  const text = draft;
                  setDraft("");
                  comment.mutate(
                    { ...ref, body: text },
                    { onError: () => setDraft(text) },
                  );
                }}
              >
                <ShadcnTextarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      e.currentTarget.form?.requestSubmit();
                  }}
                  rows={4}
                  placeholder="Leave a comment (⌘↵ to send)"
                  aria-label="Comment"
                  className="bg-(--field) hover:bg-(--field-hover) w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <Button
                  size="sm"
                  type="submit"
                  disabled={comment.isPending || !draft.trim()}
                >
                  {comment.isPending ? "Sending…" : "Comment"}
                </Button>
              </form>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Panel>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className={side}>Assignees</span>
                  {canEdit && (
                    <AssigneeMenu
                      repo={repo}
                      current={i.assignees}
                      me={me}
                      onChange={(next) => patch({ assignees: next })}
                    >
                      <ShadcnButton
                        variant="ghost"
                        type="button"
                        className={ghost}
                      >
                        Edit
                      </ShadcnButton>
                    </AssigneeMenu>
                  )}
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {i.assignees.length === 0 && (
                    <p className="text-muted-foreground text-xs">Nobody yet</p>
                  )}
                  {i.assignees.map((a) => (
                    <div key={a} className="flex items-center gap-2 text-sm">
                      <GhAvatar login={a} className="size-5" />
                      {a}
                    </div>
                  ))}
                  {canEdit && me && !i.assignees.includes(me) && (
                    <ShadcnButton
                      variant="ghost"
                      type="button"
                      className="text-primary-text text-xs hover:underline"
                      onClick={() => patch({ assignees: [...i.assignees, me] })}
                    >
                      Assign myself
                    </ShadcnButton>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className={side}>Labels</span>
                  {canEdit && (
                    <LabelMenu
                      repo={repo}
                      current={i.labels.map((l) => l.name)}
                      onChange={(next) => patch({ labels: next })}
                    >
                      <ShadcnButton
                        variant="ghost"
                        type="button"
                        className={ghost}
                      >
                        Edit
                      </ShadcnButton>
                    </LabelMenu>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {i.labels.length === 0 && (
                    <p className="text-muted-foreground text-xs">None</p>
                  )}
                  {i.labels.map((l) => (
                    <LabelChip key={l.name} {...l} />
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className={side}>Milestone</span>
                  {canEdit && (
                    <MilestoneMenu
                      repo={repo}
                      current={i.milestone}
                      onChange={(n) => patch({ milestone: n })}
                    >
                      <ShadcnButton
                        variant="ghost"
                        type="button"
                        className={ghost}
                      >
                        Edit
                      </ShadcnButton>
                    </MilestoneMenu>
                  )}
                </div>
                <p className="mt-1.5 text-sm">
                  {i.milestone ?? (
                    <span className="text-muted-foreground text-xs">None</span>
                  )}
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Pull requests"
            description="Linked by closing keywords or branch name"
          >
            {i.prs.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No pull request yet. Mention this issue in a PR with “Fixes #
                {i.number}”.
              </p>
            ) : (
              <ul className="space-y-2">
                {i.prs.map((p) => (
                  <li key={p.number}>
                    <Link
                      href={`/review/${i.repo}/${p.number}`}
                      className="hover:bg-hover -mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      <IconGitPullRequest
                        className={
                          p.state === "merged"
                            ? "mt-0.5 size-4 shrink-0 text-violet-600"
                            : p.state === "open"
                              ? "mt-0.5 size-4 shrink-0 text-emerald-600"
                              : "text-text-3 mt-0.5 size-4 shrink-0"
                        }
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-2 leading-snug">
                          {p.title}
                        </span>
                        <span className="text-text-3 text-xs">
                          #{p.number} · {p.draft ? "draft" : p.state} ·{" "}
                          {p.kind === "closes"
                            ? "closes this"
                            : "mentions this"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Related issue={i} canEdit={canEdit} />
        </aside>
      </div>
    </div>
  );
}
