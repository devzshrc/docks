"use client";
import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";

import {
  compileBody,
  compileForm,
  MAX_BODY,
  MAX_TITLE,
  missingForm,
  missingRequired,
  TEMPLATES,
  type CodeRef,
  type IssueType,
} from "@docks/api/issue";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MentionTextarea } from "@/components/mention-textarea";
import { DrawTick } from "@/components/motion";
import {
  AssigneeChips,
  FilePicker,
  Label,
  SimilarStrip,
  TraceOffer,
} from "@/components/new-issue/parts";
import type { IssueSeed, IssueSource } from "@/components/new-issue/provider";
import { FixWithAgent } from "@/components/review/agent-handoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useDraft } from "@/hooks/use-draft";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

interface Draft {
  type: IssueType;
  title: string;
  values: Record<string, string>;
  /** Name of a repo Markdown template, or null for the built-in sections. */
  template: string | null;
  body: string;
  labels: string[];
  assignees: string[];
  refs: CodeRef[];
  area: string | null;
  traceDismissed: boolean;
}

const EMPTY: Draft = {
  type: "bug",
  title: "",
  values: {},
  template: null,
  body: "",
  labels: [],
  assignees: [],
  refs: [],
  area: null,
  traceDismissed: false,
};
const TYPES = Object.keys(TEMPLATES) as IssueType[];
const select =
  "bg-(--field) hover:bg-(--field-hover) h-9 rounded-lg border px-2 text-sm";

const bannerClass = "rounded-lg border px-3 py-2 text-sm";

function lastRepo() {
  try {
    return localStorage.getItem("issue:repo");
  } catch {
    return null;
  }
}

export function NewIssuePanel({
  workspaceId,
  open,
  wantedRepo,
  source,
  seed,
  nonce,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  wantedRepo?: string;
  source: IssueSource;
  seed?: IssueSeed;
  nonce: number;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const repos = useQuery({
    ...trpc.workspace.repos.queryOptions({ workspaceId }),
    enabled: open,
  });
  const usable = (repos.data ?? []).filter(
    (r) => r.enabled && r.accessible && !r.suspended,
  );
  const [repo, setRepo] = useState("");
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [alsoLinear, setAlsoLinear] = useState(false);
  const appliedLabels = useRef(new Set<string>());
  const seeded = useRef(0);
  const clientKey = useRef("");
  const formEl = useRef<HTMLFormElement>(null);

  // Each time the panel opens: fresh idempotency key, success view cleared, repo chosen.
  useEffect(() => {
    if (!open) return;
    clientKey.current = crypto.randomUUID();
    setDone(null);
  }, [open]);
  useEffect(() => {
    if (!open || !usable.length) return;
    if (usable.some((r) => r.fullName === repo)) return;
    const pick = [wantedRepo, lastRepo()].find(
      (n) => n && usable.some((r) => r.fullName === n),
    );
    setRepo(pick ?? usable[0]!.fullName);
  }, [open, usable.length, wantedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useDraft<Draft>(
    `draft:issue:${repo || "none"}`,
    EMPTY,
  );
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const opts = useQuery({
    ...trpc.issue.options.queryOptions({ repo }),
    enabled: open && Boolean(repo),
    retry: false,
    staleTime: 60_000,
  });
  const o = opts.data;
  const labelNames = new Set(
    (o?.labels ?? []).map((l) => l.name.toLowerCase()),
  );
  const exists = (l: string) => labelNames.has(l.toLowerCase());
  const tpl = o?.templates.find((t) => t.name === draft.template) ?? null;
  const form = o?.forms.find((f) => f.name === draft.template) ?? null;

  // Starting content from a review comment: applied once per open, after the repo is known.
  useEffect(() => {
    if (!open || !repo || !seed || seeded.current === nonce) return;
    seeded.current = nonce;
    setDraft({
      ...EMPTY,
      type: "task",
      title: seed.title,
      values: { description: seed.body },
    });
  }, [open, repo, seed, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      setAlsoLinear(localStorage.getItem("issue:linear") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    appliedLabels.current = new Set();
  }, [repo, open]);

  function setType(type: IssueType) {
    const hints = TYPES.map((t) => TEMPLATES[t].label_hint).filter(
      (x): x is string => Boolean(x),
    );
    const next = TEMPLATES[type].label_hint;
    setDraft((d) => ({
      ...d,
      type,
      labels: [
        ...d.labels.filter((l) => !hints.includes(l)),
        ...(next && exists(next) ? [next] : []),
      ],
    }));
  }
  function chooseTemplate(name: string) {
    const t = o?.templates.find((x) => x.name === name) ?? null;
    const f = o?.forms.find((x) => x.name === name) ?? null;
    setDraft((d) => ({
      ...d,
      template: t?.name ?? f?.name ?? null,
      body: t && !d.body.trim() ? t.body : d.body,
      title: d.title || t?.title || f?.title || "",
      labels: [
        ...new Set([
          ...d.labels,
          ...(t?.labels ?? f?.labels ?? []).filter(exists),
        ]),
      ],
      values: f
        ? {
            ...Object.fromEntries(f.fields.map((x) => [x.id, x.value])),
            ...d.values,
          }
        : d.values,
    }));
  }

  const body = form
    ? compileForm(form.fields, draft.values, draft.refs)
    : tpl
      ? [draft.body.trim(), compileBody("task", {}, draft.refs)]
          .filter(Boolean)
          .join("\n\n")
      : compileBody(draft.type, draft.values, draft.refs);
  const missing = form
    ? missingForm(form.fields, draft.values)
    : tpl
      ? []
      : missingRequired(draft.type, draft.values);
  const text = [...Object.values(draft.values), draft.body].join("\n");
  const paths = [
    ...draft.refs.map((r) => r.path),
    ...(draft.area ? [`${draft.area}/_`] : []),
  ];

  // Labels routing rules want for these paths: added once, only if they exist in the repo, always removable.
  const ruleLabels = useQuery({
    ...trpc.issue.ruleLabels.queryOptions({ repo, paths }),
    enabled: open && Boolean(repo) && paths.length > 0 && Boolean(o),
    retry: false,
  });
  useEffect(() => {
    const fresh = (ruleLabels.data ?? []).filter(
      (l) => exists(l) && !appliedLabels.current.has(l.toLowerCase()),
    );
    if (!fresh.length) return;
    fresh.forEach((l) => appliedLabels.current.add(l.toLowerCase()));
    setDraft((d) => ({
      ...d,
      labels: [
        ...new Set([
          ...d.labels,
          ...fresh.filter((l) => !d.labels.includes(l)),
        ]),
      ].slice(0, 10),
    }));
  }, [ruleLabels.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useMutation(
    trpc.issue.create.mutationOptions({
      onSuccess: (res) => {
        try {
          localStorage.setItem("issue:repo", repo);
        } catch {}
        setDone({
          number: res.number,
          url: res.url,
          branch: res.branch,
          dropped: res.dropped,
          title: draft.title,
          body,
          byApp: res.byApp,
          linear: res.linear,
          linearError: res.linearError,
        });
        setDraft(EMPTY);
      },
    }),
  );

  const blocked = !repo
    ? "Choose a repository"
    : o && !o.hasIssues
      ? "Issues are turned off for this repository."
      : o?.archived
        ? "This repository is archived."
        : o && !o.issuesPermission
          ? "needs-permission"
          : null;

  const reason = !draft.title.trim()
    ? "Add a title"
    : missing.length
      ? `Add: ${missing.join(", ")}`
      : body.length > MAX_BODY
        ? "The description is too long"
        : null;
  const canSubmit = !blocked && !reason && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate({
      repo,
      title: draft.title,
      body,
      type: draft.type,
      labels: draft.labels,
      assignees: draft.assignees,
      clientKey: clientKey.current,
      alsoLinear: alsoLinear && Boolean(o?.linear),
      source,
      hadTrace: draft.refs.some((r) => r.line > 0),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby="new-issue-desc"
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>{done ? "Issue created" : "New issue"}</SheetTitle>
          <SheetDescription id="new-issue-desc" className="sr-only">
            Create a GitHub issue from a template, with suggested labels and
            assignees.
          </SheetDescription>
        </SheetHeader>

        {repos.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !usable.length ? (
          <p className="text-muted-foreground p-5 text-sm">
            No repositories are enabled yet.{" "}
            <Link href="/settings/repositories" className="underline">
              Choose repositories
            </Link>{" "}
            first.
          </p>
        ) : done ? (
          <Done
            done={done}
            repo={repo}
            onAnother={() => {
              setDone(null);
              clientKey.current = crypto.randomUUID();
            }}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <form
            ref={formEl}
            className="flex flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          >
            <div className="flex-1 space-y-5 p-5">
              <div className="flex items-center gap-2">
                <ShadcnSelect
                  className={cn(select, "min-w-0 flex-1 sm:flex-none")}
                  aria-label="Repository"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                >
                  {usable.map((r) => (
                    <option key={r.id} value={r.fullName}>
                      {r.fullName}
                    </option>
                  ))}
                </ShadcnSelect>
              </div>

              {opts.error && (
                <div
                  role="alert"
                  className={cn(
                    bannerClass,
                    "border-destructive/30 text-destructive",
                  )}
                >
                  Couldn&apos;t load this repository&apos;s details.{" "}
                  {opts.error.message}{" "}
                  <ShadcnButton
                    variant="ghost"
                    type="button"
                    className="underline"
                    onClick={() => opts.refetch()}
                  >
                    Retry
                  </ShadcnButton>
                </div>
              )}
              {blocked === "needs-permission" && (
                <div
                  role="alert"
                  className={cn(
                    bannerClass,
                    "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300",
                  )}
                >
                  Issues aren&apos;t enabled for this GitHub installation. An
                  admin needs to accept the GitHub App&apos;s new Issues
                  permission in{" "}
                  <a
                    className="underline"
                    href="https://github.com/settings/installations"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub settings
                  </a>
                  . Your draft is saved.
                </div>
              )}
              {o && !o.githubConnected && (
                <div className={cn(bannerClass, "text-muted-foreground")}>
                  Your GitHub account isn&apos;t connected, so the Docks app
                  will file this on your behalf and credit you in the
                  description.{" "}
                  <Link className="underline" href="/settings/integrations">
                    Connect GitHub
                  </Link>
                </div>
              )}
              {blocked && !blocked.startsWith("needs-") && repo && (
                <div
                  role="alert"
                  className={cn(bannerClass, "text-muted-foreground")}
                >
                  {blocked}
                </div>
              )}

              <div>
                <Label htmlFor="issue-title">Title</Label>
                <Input
                  id="issue-title"
                  autoFocus
                  value={draft.title}
                  maxLength={MAX_TITLE}
                  placeholder="Short, specific summary"
                  onChange={(e) => patch({ title: e.target.value })}
                />
                {draft.title.length >= 200 && (
                  <p className="text-muted-foreground mt-1 text-right text-[11px] tabular-nums">
                    {draft.title.length}/{MAX_TITLE}
                  </p>
                )}
              </div>

              <SimilarStrip repo={repo} title={draft.title} />

              <div className="flex flex-wrap items-center gap-3">
                <div className="segmented" role="group" aria-label="Issue type">
                  {TYPES.map((t) => (
                    <ShadcnButton
                      variant="ghost"
                      key={t}
                      type="button"
                      aria-pressed={draft.type === t}
                      onClick={() => setType(t)}
                    >
                      {TEMPLATES[t].label}
                    </ShadcnButton>
                  ))}
                </div>
                {o && o.templates.length + o.forms.length > 0 && (
                  <ShadcnSelect
                    className={select}
                    aria-label="Template"
                    value={draft.template ?? ""}
                    onChange={(e) =>
                      e.target.value
                        ? chooseTemplate(e.target.value)
                        : patch({ template: null })
                    }
                  >
                    <option value="">Docks template</option>
                    {[...o.templates, ...o.forms].map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </ShadcnSelect>
                )}
              </div>
              {o?.usesForms && !o.templates.length && !o.forms.length && (
                <p className="text-muted-foreground -mt-2 text-xs">
                  This repo&apos;s issue forms couldn&apos;t be read. Using the
                  Docks template instead.
                </p>
              )}

              {form ? (
                <div className="space-y-4">
                  {form.fields.map((f) => (
                    <FormFieldInput
                      key={f.id}
                      field={f}
                      value={draft.values[f.id] ?? ""}
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          values: { ...d.values, [f.id]: v },
                        }))
                      }
                    />
                  ))}
                </div>
              ) : tpl ? (
                <div>
                  <Label htmlFor="issue-body">Description</Label>
                  <MentionTextarea
                    id="issue-body"
                    rows={10}
                    value={draft.body}
                    onChange={(v) => patch({ body: v })}
                    className="bg-(--field) hover:bg-(--field-hover) w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  {draft.body.trim() !== tpl.body && (
                    <ShadcnButton
                      variant="ghost"
                      type="button"
                      className="text-muted-foreground hover:text-foreground mt-1 text-xs underline underline-offset-2"
                      onClick={() => patch({ body: tpl.body })}
                    >
                      Replace with template text
                    </ShadcnButton>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {TEMPLATES[draft.type].sections.map((s) => (
                    <div key={s.key}>
                      <Label htmlFor={`issue-${s.key}`}>
                        {s.label}
                        {s.required && (
                          <span className="text-destructive"> *</span>
                        )}
                      </Label>
                      <MentionTextarea
                        id={`issue-${s.key}`}
                        rows={s.required ? 4 : 2}
                        value={draft.values[s.key] ?? ""}
                        placeholder={s.placeholder}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            values: { ...d.values, [s.key]: v },
                          }))
                        }
                        className="bg-(--field) hover:bg-(--field-hover) w-full rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              <TraceOffer
                repo={repo}
                text={text}
                linked={draft.refs}
                dismissed={draft.traceDismissed}
                onLink={(refs) =>
                  patch({ refs: [...draft.refs, ...refs].slice(0, 10) })
                }
                onDismiss={() => patch({ traceDismissed: true })}
              />
              <div className="space-y-2">
                {draft.refs.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {draft.refs.map((r) => (
                      <li
                        key={`${r.path}:${r.line}`}
                        className="bg-muted text-muted-foreground flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 font-code text-[11px]"
                      >
                        {r.path.split("/").pop()}
                        {r.line ? `:${r.line}` : ""}
                        <ShadcnButton
                          variant="ghost"
                          type="button"
                          aria-label={`Remove ${r.path}`}
                          className="hover:text-foreground rounded px-1"
                          onClick={() =>
                            patch({ refs: draft.refs.filter((x) => x !== r) })
                          }
                        >
                          ×
                        </ShadcnButton>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.refs.length < 10 && (
                  <FilePicker
                    repo={repo}
                    onPick={(r) => patch({ refs: [...draft.refs, r] })}
                  />
                )}
              </div>

              <div className="space-y-4 border-t pt-5">
                {o && o.areas.length > 0 && (
                  <div>
                    <Label htmlFor="issue-area">
                      Area (helps suggest who can take it)
                    </Label>
                    <ShadcnSelect
                      id="issue-area"
                      className={cn(select, "w-full")}
                      value={draft.area ?? ""}
                      onChange={(e) => patch({ area: e.target.value || null })}
                    >
                      <option value="">Not sure</option>
                      {o.areas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </ShadcnSelect>
                  </div>
                )}
                <div>
                  <Label>Assignee</Label>
                  {repo && (
                    <AssigneeChips
                      repo={repo}
                      paths={paths}
                      selected={draft.assignees}
                      onToggle={(login) =>
                        patch({
                          assignees: draft.assignees.includes(login)
                            ? draft.assignees.filter((l) => l !== login)
                            : [...draft.assignees, login].slice(0, 5),
                        })
                      }
                    />
                  )}
                </div>
                <div>
                  <Label htmlFor="issue-labels">Labels</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {draft.labels.map((l) => (
                      <span
                        key={l}
                        className="bg-muted flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs"
                      >
                        {l}
                        <ShadcnButton
                          variant="ghost"
                          type="button"
                          aria-label={`Remove label ${l}`}
                          className="text-muted-foreground hover:text-foreground rounded px-1"
                          onClick={() =>
                            patch({
                              labels: draft.labels.filter((x) => x !== l),
                            })
                          }
                        >
                          ×
                        </ShadcnButton>
                      </span>
                    ))}
                    {o && (
                      <ShadcnSelect
                        id="issue-labels"
                        className={cn(select, "h-7 text-xs")}
                        value=""
                        aria-label="Add label"
                        onChange={(e) =>
                          e.target.value &&
                          patch({
                            labels: [...draft.labels, e.target.value].slice(
                              0,
                              10,
                            ),
                          })
                        }
                      >
                        <option value="">+ Label</option>
                        {o.labels
                          .filter((l) => !draft.labels.includes(l.name))
                          .map((l) => (
                            <option key={l.name} value={l.name}>
                              {l.name}
                            </option>
                          ))}
                      </ShadcnSelect>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {o?.linear && (
              <label className="text-muted-foreground mx-5 mb-3 flex items-center gap-2 text-xs">
                <ShadcnCheckbox
                  checked={alsoLinear}
                  onChange={(e) => {
                    setAlsoLinear(e.target.checked);
                    try {
                      localStorage.setItem(
                        "issue:linear",
                        e.target.checked ? "1" : "0",
                      );
                    } catch {}
                  }}
                />
                Also create in Linear ({o.linear.teamName})
              </label>
            )}
            <div className="bg-background sticky bottom-0 flex flex-wrap items-center gap-3 border-t px-5 py-3">
              <span className="text-muted-foreground text-xs">
                {create.error
                  ? null
                  : reason
                    ? reason
                    : draft.title || Object.values(draft.values).some(Boolean)
                      ? "Draft saved on this device"
                      : ""}
              </span>
              {create.error && (
                <span role="alert" className="text-destructive text-xs">
                  {create.error.message}
                </span>
              )}
              <span className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  pending={create.isPending}
                  disabled={!canSubmit}
                >
                  Create issue
                  <kbd className="bg-white/20 ml-1 hidden rounded px-1 text-[10px] sm:inline">
                    ⌘↵
                  </kbd>
                </Button>
              </span>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface DoneInfo {
  number: number;
  url: string;
  branch: string;
  dropped: { labels: string[]; assignees: string[] };
  title: string;
  body: string;
  byApp: boolean;
  linear: { id: string; url: string } | null;
  linearError: string | null;
}

function FormFieldInput({
  field,
  value,
  onChange,
}: {
  field: import("@docks/api/issue").FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `issue-f-${field.id}`;
  const box =
    "bg-(--field) hover:bg-(--field-hover) w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <div>
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.description && (
        <p className="text-muted-foreground -mt-1 mb-1.5 text-xs">
          {field.description}
        </p>
      )}
      {field.kind === "textarea" ? (
        <MentionTextarea
          id={id}
          rows={4}
          value={value}
          placeholder={field.placeholder}
          onChange={onChange}
          className={box}
        />
      ) : field.kind === "input" ? (
        <Input
          id={id}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "dropdown" ? (
        <ShadcnSelect
          id={id}
          className={cn(select, "w-full")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </ShadcnSelect>
      ) : (
        <div className="space-y-1.5">
          {field.options.map((opt) => {
            const set = new Set(value.split("\n").filter(Boolean));
            return (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <ShadcnCheckbox
                  checked={set.has(opt)}
                  onChange={(e) => {
                    e.target.checked ? set.add(opt) : set.delete(opt);
                    onChange([...set].join("\n"));
                  }}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Done({
  done,
  repo,
  onAnother,
  onClose,
}: {
  done: DoneInfo;
  repo: string;
  onAnother: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = [
    `Implement ${repo}#${done.number}: ${done.title}`,
    done.body,
    `Work on a new branch named ${done.branch} off the default branch. Make the smallest change that resolves the issue, keep the existing style, add or update tests, and open a pull request whose description says "Closes #${done.number}".`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const dropped = [
    ...done.dropped.labels.map((l) => `label "${l}"`),
    ...done.dropped.assignees.map((a) => `assignee ${a}`),
  ];

  return (
    <div className="animate-in fade-in space-y-5 p-5 duration-200">
      <div className="flex items-start gap-3">
        <DrawTick className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 space-y-1">
          <a
            href={done.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            <span className="text-muted-foreground font-code mr-1.5 text-xs">
              #{done.number}
            </span>
            {done.title}
          </a>
          <p className="text-muted-foreground text-xs">{repo}</p>
        </div>
      </div>
      {done.byApp && (
        <p className="text-muted-foreground text-xs">
          Filed by the Docks app on your behalf. Connect GitHub to create issues
          as yourself.
        </p>
      )}
      {done.linear && (
        <p className="text-sm">
          Also in Linear:{" "}
          <a
            href={done.linear.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {done.linear.id}
          </a>
        </p>
      )}
      {done.linearError && (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">
          The GitHub issue was created, but Linear failed: {done.linearError}
        </p>
      )}
      {dropped.length > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
        >
          Created, but GitHub didn&apos;t apply {dropped.join(", ")}. Setting
          labels and assignees needs triage access on the repository.
        </p>
      )}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Start working on it</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(done.branch);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              } catch {}
            }}
          >
            {copied ? "Copied" : "Copy branch name"}
          </Button>
          <code className="text-muted-foreground font-code text-xs">
            {done.branch}
          </code>
          <FixWithAgent prompt={prompt} label="Fix with agent" />
        </div>
        <p className="text-muted-foreground text-xs">
          A PR from that branch shows this issue in its Linked issues panel.
        </p>
      </div>
      <div className="flex gap-2 border-t pt-4">
        <Button type="button" onClick={onAnother}>
          Create another
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={done.url} target="_blank" rel="noreferrer">
            Open on GitHub
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
