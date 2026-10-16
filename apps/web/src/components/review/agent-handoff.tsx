"use client";
import { Button as ShadcnButton } from "@/components/ui/button";

import { ComputerTerminal01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import {
  AgentStackIcon,
  BrandIcon,
  Px0Icon,
  type Brand,
} from "@/components/brand-icons";
import { DrawTick } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** POSIX single-quote: safe to paste into any shell. */
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const AGENTS = [
  {
    id: "claude",
    label: "Claude Code",
    cmd: (p: string) => `claude ${shq(p)}`,
  },
  { id: "codex", label: "Codex", cmd: (p: string) => `codex ${shq(p)}` },
  {
    id: "cursor",
    label: "Cursor Agent",
    cmd: (p: string) => `cursor-agent ${shq(p)}`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    cmd: (p: string) => `gemini -i ${shq(p)}`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    cmd: (p: string) => `opencode run ${shq(p)}`,
  },
  {
    id: "aider",
    label: "Aider",
    cmd: (p: string) => `aider --message ${shq(p)}`,
  },
  { id: "prompt", label: "Prompt only", cmd: (p: string) => p },
] as const;

export type FixContext = {
  repo: string;
  number: number;
  branch: string;
  path: string | null;
  line: number | null;
  comments: {
    author: string;
    body: string;
    path?: string;
    line?: number | null;
  }[];
};

/** The prompt an agent gets: where, what reviewers said, and to keep the change scoped. */
export function fixPrompt(c: FixContext) {
  const where = c.path
    ? c.line
      ? `${c.path}:${c.line}`
      : c.path
    : "the changed files";
  const said = c.comments
    .map(
      (m) =>
        `- ${m.author}${m.path ? ` on ${m.path}${m.line ? `:${m.line}` : ""}` : ""}: ${m.body.trim()}`,
    )
    .join("\n");
  return [
    `Work on ${c.repo}#${c.number} (branch ${c.branch}), focusing on ${where}.`,
    said
      ? `Address these open review comments:\n${said}`
      : `There are no open review comments yet. Review the diff against the base branch for bugs, missing tests and risky changes, and fix what you find.`,
    `Make the smallest change that resolves this, keep the existing style, run the relevant tests, and summarise what you changed.`,
  ].join("\n\n");
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    async run(id: string, text: string) {
      if (await copy(text)) {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
      }
    },
  };
}

const BRAND: Record<string, Brand> = {
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
};

/** "Fix with agent": copies a ready-to-run command for a local coding agent. */
export function FixWithAgent({
  context,
  prompt,
  label = "Fix with agent",
  compact = false,
}: {
  context?: FixContext;
  prompt?: string;
  label?: string;
  compact?: boolean;
}) {
  const { copied, run } = useCopied();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={compact ? "sm" : "default"}
          variant={compact ? "ghost" : "outline"}
          className={cn("group/agent gap-2", compact && "px-2")}
        >
          {copied ? (
            <DrawTick className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AgentStackIcon />
          )}
          {copied ? "Copied" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Run in your checkout</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AGENTS.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={() =>
              void run(a.id, a.cmd(prompt ?? fixPrompt(context!)))
            }
          >
            {a.id in BRAND ? (
              <BrandIcon brand={BRAND[a.id]!} />
            ) : (
              <HugeiconsIcon
                icon={a.id === "prompt" ? Copy01Icon : ComputerTerminal01Icon}
                size={15}
                aria-hidden
              />
            )}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Review in px0": hands the PR to px0 (px0.ai), a fast local review IDE. */
export function OpenInPx0({
  prUrl,
  branch,
}: {
  prUrl: string;
  branch: string;
}) {
  const { copied, run } = useCopied();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ShadcnButton
          variant="ghost"
          type="button"
          className="tex-neutral flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium"
        >
          {copied ? (
            <DrawTick className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Px0Icon className="h-3.5" />
          )}
          {copied ? "Copied" : "Review in px0"}
        </ShadcnButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Comments sync back here</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run("pr", `px0 ${prUrl}`)}>
          <Px0Icon className="h-3.5" />
          <span className="flex flex-col">
            Copy review command
            <span className="text-muted-foreground font-code text-[11px]">
              px0 {prUrl.replace("https://github.com/", "…/")}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void run(
              "local",
              `git fetch origin ${shq(branch)} && git switch ${shq(branch)} && px0 .`,
            )
          }
        >
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={15} aria-hidden />
          <span className="flex flex-col">
            Copy checkout + open
            <span className="text-muted-foreground text-[11px]">
              Switches your local clone to this branch
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href="https://px0.ai/docs"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground text-xs"
          >
            Install px0 →
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
