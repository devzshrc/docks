"use client";

import { useState } from "react";
import { DrawTick } from "@/components/motion";
import { FixWithAgent } from "@/components/review/agent-handoff";
import { Button } from "@/components/ui/button";

/** What the panel shows after an issue is created. */
export interface DoneInfo {
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

export function Done({
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
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
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
