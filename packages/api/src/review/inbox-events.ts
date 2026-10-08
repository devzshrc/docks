import type { InboxContext, InboxKind } from "@docks/db";

export interface InboxPayload {
  action?: string;
  sha?: string;
  state?: string;
  context?: string;
  target_url?: string;
  updated_at?: string;
  sender?: { login: string };
  requested_reviewer?: { login: string };
  pull_request?: {
    number: number;
    title?: string;
    head?: { sha: string };
    updated_at?: string;
  };
  issue?: { number: number; title: string; pull_request?: unknown };
  review?: { id: number; submitted_at?: string; html_url?: string };
  comment?: {
    id: number;
    in_reply_to_id?: number;
    html_url?: string;
    created_at?: string;
  };
  check_run?: {
    id: number;
    name?: string;
    conclusion?: string | null;
    completed_at?: string | null;
    head_sha?: string;
    html_url?: string;
    pull_requests: { number: number }[];
  };
}

export function inboxEvents(
  event: string,
  p: InboxPayload,
  deliveryId: string,
) {
  const events: {
    kind: InboxKind;
    prNumber: number;
    sourceKey: string;
    occurredAt: Date;
    context: InboxContext;
  }[] = [];
  const pr = p.pull_request;
  const add = (
    kind: InboxKind,
    number: number,
    identity: string,
    url?: string,
    date?: string | null,
    title?: string,
  ) => {
    const parsed = date ? new Date(date) : new Date();
    events.push({
      kind,
      prNumber: number,
      sourceKey: `${kind}:${identity}`,
      occurredAt: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
      context: {
        title:
          title ?? pr?.title ?? p.issue?.title ?? `Pull request #${number}`,
        actor: p.sender?.login ?? "",
        headSha: pr?.head?.sha ?? p.check_run?.head_sha ?? p.sha ?? null,
        url: url ?? null,
        requestedLogin: p.requested_reviewer?.login ?? null,
        replyTo: p.comment?.in_reply_to_id ?? null,
      },
    });
  };
  if (event === "pull_request" && pr) {
    if (p.action === "review_requested" && p.requested_reviewer)
      add("review_requested", pr.number, deliveryId, undefined, pr.updated_at);
    if (p.action === "synchronize" && pr.head)
      add(
        "new_commit",
        pr.number,
        `${pr.number}:${pr.head.sha}`,
        undefined,
        pr.updated_at,
      );
  }
  if (
    event === "pull_request_review" &&
    p.action === "submitted" &&
    pr &&
    p.review
  )
    add(
      "review_submitted",
      pr.number,
      String(p.review.id),
      p.review.html_url,
      p.review.submitted_at,
    );
  if (
    event === "pull_request_review_comment" &&
    p.action === "created" &&
    pr &&
    p.comment?.in_reply_to_id
  )
    add(
      "thread_reply",
      pr.number,
      String(p.comment.id),
      p.comment.html_url,
      p.comment.created_at,
    );
  if (
    event === "check_run" &&
    p.action === "completed" &&
    p.check_run &&
    [
      "failure",
      "timed_out",
      "action_required",
      "cancelled",
      "startup_failure",
    ].includes(p.check_run.conclusion ?? "")
  ) {
    for (const pull of p.check_run.pull_requests)
      add(
        "check_failed",
        pull.number,
        `${p.check_run.id}:${pull.number}`,
        p.check_run.html_url,
        p.check_run.completed_at,
        `Check ${p.check_run.name ?? ""} failed`,
      );
  }
  if (
    event === "status" &&
    pr &&
    p.sha &&
    ["failure", "error"].includes(p.state ?? "")
  )
    add(
      "check_failed",
      pr.number,
      `status:${deliveryId}:${pr.number}`,
      p.target_url,
      p.updated_at,
      `Check ${p.context ?? ""} failed`,
    );
  return events;
}

export function recipientLogins(
  kind: InboxKind,
  context: InboxContext,
  input: {
    author: string;
    requested: string[];
    reviews: { login: string; commit: string | null }[];
    participants: string[];
  },
) {
  const people =
    kind === "review_requested"
      ? [context.requestedLogin ?? ""]
      : kind === "new_commit"
        ? input.reviews
            .filter((r) => r.commit !== context.headSha)
            .map((r) => r.login)
        : kind === "thread_reply"
          ? input.participants
          : [input.author];
  return [
    ...new Set(
      people
        .map((p) => p.toLowerCase())
        .filter(
          (p) =>
            p &&
            p !== context.actor.toLowerCase() &&
            p !== (kind === "new_commit" ? input.author.toLowerCase() : ""),
        ),
    ),
  ];
}
