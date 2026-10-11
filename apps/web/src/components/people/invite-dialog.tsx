"use client";

import { RiCheckLine, RiCloseLine, RiFileCopyLine, RiLink, RiLoader4Line, RiMailSendLine } from "@remixicon/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

type Status = "idle" | "sending" | "sent" | "error";
type Chip = { email: string; status: Status; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds each address typed or pasted (comma, semicolon or space separated), skipping duplicates. */
function mergeEmails(prev: Chip[], raw: string): Chip[] {
  const seen = new Set(prev.map((c) => c.email));
  const added = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && !seen.has(e) && seen.add(e));
  return added.length ? [...prev, ...added.map((email) => ({ email, status: "idle" as Status }))] : prev;
}

/** Invite by email (several at once, sent one by one with per-address status) or by shareable link. */
export function InviteDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const invites = useQuery({
    ...trpc.workspace.invites.queryOptions({ workspaceId }),
    enabled: open,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries(trpc.workspace.invites.queryFilter());
  const sendOne = useMutation(trpc.workspace.inviteByEmail.mutationOptions());
  const createLink = useMutation(
    trpc.workspace.createInvite.mutationOptions({
      onSuccess: (res) => {
        setLink(res.url);
        setCopied(false);
        void refresh();
      },
    }),
  );
  const revoke = useMutation(trpc.workspace.revokeInvite.mutationOptions({ onSuccess: refresh }));

  const pending = chips.filter((c) => EMAIL.test(c.email) && (c.status === "idle" || c.status === "error"));
  const sending = chips.some((c) => c.status === "sending");
  // One message for the whole dialog: a limit or permission error is the same for every address.
  const problem = chips.find((c) => c.status === "error")?.error ?? createLink.error?.message;
  const allSent = chips.length > 0 && chips.every((c) => c.status === "sent");

  const addFromDraft = (raw = draft) => {
    setChips((prev) => mergeEmails(prev, raw));
    setDraft("");
  };

  const send = async () => {
    const queue = mergeEmails(chips, draft);
    setChips(queue);
    setDraft("");
    for (const chip of queue) {
      if (chip.status === "sent" || !EMAIL.test(chip.email)) continue;
      setChips((prev) => prev.map((c) => (c.email === chip.email ? { ...c, status: "sending" } : c)));
      try {
        await sendOne.mutateAsync({ workspaceId, email: chip.email });
        setChips((prev) => prev.map((c) => (c.email === chip.email ? { ...c, status: "sent" } : c)));
      } catch (e) {
        const error = e instanceof Error ? e.message : "Couldn't send";
        setChips((prev) => prev.map((c) => (c.email === chip.email ? { ...c, status: "error", error } : c)));
      }
    }
    void refresh();
  };

  const reset = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setChips([]);
      setDraft("");
      setLink(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[460px]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Invite teammates</DialogTitle>
          <DialogDescription>Each email gets a personal link that works for 7 days.</DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <div
            onClick={() => inputRef.current?.focus()}
            className="flex min-h-[84px] cursor-text flex-wrap content-start gap-1.5 rounded-xl bg-secondary p-2 shadow-control transition-shadow focus-within:shadow-[0_0_0_1px_var(--primary),0_0_0_4px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
          >
            {chips.map((chip) => {
              const invalid = !EMAIL.test(chip.email);
              return (
                <span
                  key={chip.email}
                  title={chip.error}
                  className={cn(
                    "animate-in fade-in zoom-in-95 inline-flex h-7 items-center gap-1.5 rounded-full pr-1 pl-2.5 text-xs font-medium duration-150",
                    invalid || chip.status === "error"
                      ? "bg-danger/10 text-danger"
                      : chip.status === "sent"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)]",
                  )}
                >
                  {chip.email}
                  {chip.status === "sending" ? (
                    <RiLoader4Line className="size-3.5 animate-spin" aria-label="Sending" />
                  ) : chip.status === "sent" ? (
                    <RiCheckLine className="animate-in zoom-in-50 size-3.5 duration-200" aria-label="Sent" />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${chip.email}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setChips((prev) => prev.filter((c) => c.email !== chip.email));
                      }}
                      className="grid size-5 place-items-center rounded-full transition-colors hover:bg-foreground/10"
                    >
                      <RiCloseLine className="size-3.5" />
                    </button>
                  )}
                </span>
              );
            })}
            <input
              ref={inputRef}
              value={draft}
              type="text"
              inputMode="email"
              autoComplete="off"
              aria-label="Email addresses"
              placeholder={chips.length ? "" : "name@company.com, another@company.com"}
              onChange={(e) => {
                const v = e.target.value;
                if (/[,;\s]$/.test(v)) addFromDraft(v);
                else setDraft(v);
              }}
              onPaste={(e) => {
                e.preventDefault();
                addFromDraft(draft + e.clipboardData.getData("text"));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (draft.trim()) addFromDraft();
                  else if (pending.length) void send();
                }
                if (e.key === "Backspace" && !draft && chips.length) {
                  setChips((prev) => (prev.at(-1)?.status === "sent" ? prev : prev.slice(0, -1)));
                }
              }}
              onBlur={() => addFromDraft()}
              className="h-7 min-w-[140px] flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-subtle"
            />
          </div>
          {problem && (
            <div role="alert" className="animate-in fade-in slide-in-from-top-1 mt-3 flex items-center justify-between gap-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground duration-200">
              <span>{problem}</span>
              {/upgrade/i.test(problem) && (
                <Link href="/settings/billing" className="shrink-0 font-medium text-primary-text hover:underline">
                  View plans
                </Link>
              )}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {allSent
                ? `${chips.length} ${chips.length === 1 ? "invite" : "invites"} sent`
                : "Press Enter or comma to add each address."}
            </p>
            <Button onClick={() => void send()} disabled={sending || (!pending.length && !draft.trim())} pending={sending}>
              {sending ? <RiLoader4Line className="animate-spin" /> : <RiMailSendLine />}
              {pending.length > 1 ? `Send ${pending.length} invites` : "Send invite"}
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Invite with a link</p>
              <p className="text-xs text-muted-foreground">Anyone with the link can join.</p>
            </div>
            {!link && (
              <Button variant="outline" size="sm" onClick={() => createLink.mutate({ workspaceId })} pending={createLink.isPending}>
                <RiLink />
                Create link
              </Button>
            )}
          </div>
          {link && (
            <div className="animate-in fade-in slide-in-from-top-1 mt-3 flex items-center gap-2 rounded-lg bg-muted/70 p-1 pl-3 duration-200">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{link}</span>
              <Button
                size="sm"
                variant={copied ? "secondary" : "outline"}
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="w-[84px]"
              >
                {copied ? <RiCheckLine className="animate-in zoom-in-50 text-success duration-200" /> : <RiFileCopyLine />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>

        {invites.data && invites.data.length > 0 && (
          <div className="border-t bg-muted/40 px-6 py-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pending · {invites.data.length}</p>
            <ul className="stagger grid max-h-36 gap-1 overflow-y-auto">
              {invites.data.map((inv) => (
                <li key={inv.id} className="group flex items-center justify-between gap-2 rounded-md py-1 text-xs">
                  <span className="truncate">{inv.email ?? "Shareable link"}</span>
                  <span className="flex items-center gap-2 text-subtle">
                    expires {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    <button
                      type="button"
                      aria-label={`Revoke invite for ${inv.email ?? "link"}`}
                      onClick={() => revoke.mutate({ workspaceId, inviteId: inv.id })}
                      className="grid size-5 place-items-center rounded-full opacity-0 transition-[opacity,background-color] group-hover:opacity-100 hover:bg-foreground/10 focus-visible:opacity-100"
                    >
                      <RiCloseLine className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
