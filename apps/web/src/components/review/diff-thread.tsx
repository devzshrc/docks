"use client";

import type { AskDetail } from "@/components/review/ask-panel";
import { errorMessage } from "@/lib/error-message";
import { Button as ShadcnButton } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { MentionTextarea } from "@/components/mention-textarea";
import { useNewIssue } from "@/components/new-issue/provider";
import { FixWithAgent } from "@/components/review/agent-handoff";
import { Collapse } from "@/components/motion";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReviewDraft, useReviewSession } from "@/hooks/use-review-session";
import { optimistic } from "@/lib/optimistic";
import { COMMENT_LABELS, commentLabel } from "@/lib/diff";
import { cx as cn } from "@/utils/cx";
import { useTRPC } from "@/trpc/react";
import { type Side, type PendingComment, type Thread, ASK_PRESETS, LABEL_STYLE } from "./diff-types";

/** Line comment composer and review threads inside a file diff. */
export function LabelBadge({ body }: { body: string }) {
  const label = commentLabel(body);
  return label ? (
    <span
      className={cn(
        "rounded px-1.5 py-px text-[10.5px] font-medium",
        LABEL_STYLE[label],
      )}
    >
      {label}
    </span>
  ) : null;
}

export function Composer({
  path,
  line,
  startLine,
  side,
  lineText,
  repo,
  number,
  onAddPending,
  onPosted,
  onCancel,
}: {
  path: string;
  line: number;
  startLine?: number;
  side: Side;
  lineText: string;
  repo: string;
  number: number;
  onAddPending: (c: PendingComment) => void;
  onPosted: () => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const session = useReviewSession();
  const [body, setBody] = useReviewDraft(
    `draft:line:${repo}#${number}:${path}:${side}:${line}@${session.headSha}`,
  );
  const post = useMutation(
    trpc.review.comment.mutationOptions({
      onSuccess: (_data, vars) => {
        setBody((current) => (current === vars.body ? "" : current));
        void session.flush();
        onPosted();
      },
    }),
  );
  return (
    <div className="bg-muted/40 animate-in fade-in slide-in-from-top-1 space-y-2 border-y p-2 font-sans duration-150">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">
          {startLine ? `Lines ${startLine}–${line}` : `Line ${line}`}
        </span>
        {COMMENT_LABELS.map((l) => (
          <ShadcnButton
            variant="ghost"
            key={l}
            type="button"
            aria-pressed={commentLabel(body) === l}
            onClick={() =>
              setBody(
                (b) =>
                  `**${l}:** ${b.replace(/^\**\s*\w+\s*(\([^)]*\))?\s*:\**\s*/, "")}`,
              )
            }
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
              commentLabel(body) === l
                ? LABEL_STYLE[l]
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {l}
          </ShadcnButton>
        ))}
        <span className="ml-auto flex items-center gap-1">
          {ASK_PRESETS.map(([label, q]) => (
            <ShadcnButton
              variant="ghost"
              key={label}
              type="button"
              className="text-muted-foreground hover:bg-muted rounded-md px-1.5 py-0.5 text-[11px]"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent<AskDetail>("review-ask", {
                    detail: { path, line, question: q(lineText.trim(), path, line) },
                  }),
                )
              }
            >
              {label}
            </ShadcnButton>
          ))}
        </span>
        {!startLine && (
          <span className="text-muted-foreground basis-full text-[11px]">
            Shift-click another line number to select a range
          </span>
        )}
      </div>
      <MentionTextarea
        value={body}
        onChange={setBody}
        rows={3}
        autoFocus
        placeholder="Leave a comment"
        aria-label={`Comment on line ${line}`}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!body.trim()}
          onClick={() => {
            onAddPending({ path, line, startLine, side, body });
            setBody("");
          }}
        >
          Add to review
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!body.trim()}
          pending={post.isPending}
          onClick={() =>
            post.mutate({ repo, number, path, line, startLine, side, body })
          }
        >
          Comment now
        </Button>
        {side === "RIGHT" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setBody(
                (b) =>
                  `${b}${b ? "\n" : ""}\`\`\`suggestion\n${lineText}\n\`\`\``,
              )
            }
          >
            Suggest change
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {post.error && (
          <span role="alert" className="text-destructive text-sm">
            {errorMessage(post.error)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ThreadView({
  thread,
  repo,
  number,
  branch,
  canAct,
  onChanged,
}: {
  thread: Thread;
  repo: string;
  number: number;
  branch: string;
  canAct: boolean;
  onChanged: () => void;
}) {
  const session = useReviewSession();
  const trpc = useTRPC();
  const [open, setOpen] = useState(!thread.isResolved);
  // Resolving folds the thread away; unresolving opens it again.
  useEffect(() => setOpen(!thread.isResolved), [thread.isResolved]);
  const [reply, setReply] = useReviewDraft(
    `draft:reply:${repo}#${number}:${thread.id}`,
  );
  const queryClient = useQueryClient();
  const threadsFilter = trpc.review.threads.queryFilter({ repo, number });
  // Reply and resolve show up at once; GitHub's answer replaces them when it arrives.
  const send = useMutation(
    trpc.review.reply.mutationOptions(
      optimistic<{ commentId: number; body: string }>(
        queryClient,
        [
          {
            filter: threadsFilter,
            patch: (d: { threads: Thread[] }, v) => ({
              ...d,
              threads: d.threads.map((t) =>
                t.id === thread.id
                  ? {
                      ...t,
                      comments: [
                        ...t.comments,
                        {
                          id: -Date.now(),
                          author: "You",
                          body: v.body,
                          createdAt: new Date().toISOString(),
                        },
                      ],
                    }
                  : t,
              ),
            }),
          },
        ],
        { settled: onChanged, onError: (e) => toast(e.message, "error") },
      ),
    ),
  );
  const resolve = useMutation(
    trpc.review.resolveThread.mutationOptions(
      optimistic<{ threadId: string; resolve: boolean }>(
        queryClient,
        [
          {
            filter: threadsFilter,
            patch: (d: { threads: Thread[] }, v) => ({
              ...d,
              threads: d.threads.map((t) =>
                t.id === v.threadId ? { ...t, isResolved: v.resolve } : t,
              ),
            }),
          },
        ],
        { settled: onChanged },
      ),
    ),
  );
  const { open: openIssue, canCreate } = useNewIssue();
  /** Follow-up: turn this thread into an issue that links back to the comment. */
  function followUp() {
    const first = thread.comments[0];
    if (!first) return;
    const quoted = first.body
      .trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    const where = `${thread.path}${thread.line ? `:${thread.line}` : ""}`;
    openIssue({
      repo,
      source: "comment",
      seed: {
        followUp: {
          repo,
          number,
          headSha: session.headSha,
          commentId: first.id,
          path: thread.path,
          line: thread.line ?? undefined,
        },
        title: first.body
          .trim()
          .split("\n")[0]!
          .replace(/^\**\w+\**:\s*/, "")
          .slice(0, 100),
        body: `${quoted}\n\nFrom the review of ${repo}#${number}, [\`${where}\`](https://github.com/${repo}/pull/${number}#discussion_r${first.id}) (@${first.author}).`,
      },
    });
  }
  return (
    <div
      className={cn(
        "bg-background m-2 rounded-md border font-sans text-sm transition-opacity duration-300",
        thread.isResolved && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2 pr-1.5">
        <ShadcnButton
          variant="row"
          size="none"
          type="button"
          className="text-muted-foreground flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? (
            <IconChevronDown className="size-3" aria-hidden />
          ) : (
            <IconChevronRight className="size-3" aria-hidden />
          )}
          {thread.comments[0] && <LabelBadge body={thread.comments[0].body} />}
          {thread.comments.length} comment
          {thread.comments.length === 1 ? "" : "s"}
          {thread.isResolved && <Badge variant="secondary">resolved</Badge>}
          {thread.isOutdated && <Badge variant="outline">outdated</Badge>}
        </ShadcnButton>
        {canCreate && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={followUp}
          >
            Create issue
          </Button>
        )}
        {!thread.isResolved && (
          <FixWithAgent
            compact
            context={{
              repo,
              number,
              branch,
              path: thread.path,
              line: thread.line,
              comments: thread.comments,
            }}
          />
        )}
      </div>
      <Collapse open={open}>
        <div className="space-y-3 border-t px-3 py-2">
          {thread.comments.map((c) => (
            <div key={c.id}>
              <div className="text-xs">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {canAct && (
            <div className="space-y-2">
              <MentionTextarea
                value={reply}
                onChange={setReply}
                rows={2}
                placeholder="Reply"
                aria-label="Reply"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!reply.trim()}
                  pending={send.isPending}
                  onClick={() => {
                    const text = reply;
                    send.mutate(
                      {
                        repo,
                        number,
                        commentId: thread.comments[0]!.id,
                        body: text,
                      },
                      {
                        onSuccess: () =>
                          setReply((current) =>
                            current === text ? "" : current,
                          ),
                      },
                    );
                  }}
                >
                  Reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={resolve.isPending}
                  onClick={() =>
                    resolve.mutate({
                      repo,
                      number,
                      threadId: thread.id,
                      resolve: !thread.isResolved,
                    })
                  }
                >
                  {thread.isResolved ? "Unresolve" : "Resolve"}
                </Button>
                {(send.error ?? resolve.error) && (
                  <span role="alert" className="text-destructive">
                    {(send.error ?? resolve.error)!.message}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}
