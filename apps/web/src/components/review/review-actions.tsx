"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

import { MentionTextarea } from "@/components/mention-textarea"
import type { PendingComment } from "@/components/review/file-diff"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/toast"
import { useDraft } from "@/hooks/use-draft"
import { optimistic } from "@/lib/optimistic"
import { useTRPC } from "@/trpc/react"

type Event = "APPROVE" | "REQUEST_CHANGES" | "COMMENT"

/** GitHub mergeable_state values that block merging, explained. */
const MERGE_STATE: Record<string, string> = {
  blocked: "Blocked by branch protection (required reviews or checks)",
  dirty: "Has merge conflicts. Resolve them on GitHub or locally.",
  behind: "Behind the base branch. Update it first.",
  draft: "Still a draft",
}

/** Approve, request changes, comment, merge (§5.3). */
export function ReviewActions({
  repo,
  number,
  canMerge,
  githubLogin,
  own = false,
  mergeableState = null,
  pending = [],
  onSubmitted,
  onDiscardPending,
}: {
  repo: string
  number: number
  canMerge: boolean
  githubLogin: string | null
  /** GitHub refuses approvals and change requests from the PR's own author. */
  own?: boolean
  mergeableState?: string | null
  pending?: PendingComment[]
  onSubmitted?: () => void
  onDiscardPending?: () => void
}) {
  const [method, setMethod] = useState<"squash" | "merge" | "rebase">("squash")
  const blocked = mergeableState ? MERGE_STATE[mergeableState] : undefined
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [body, setBody] = useDraft(`draft:body:${repo}#${number}`, "")
  const [error, setError] = useState<string>()

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.review.get.queryFilter({ repo, number })),
      queryClient.invalidateQueries(trpc.review.board.queryFilter()),
    ])

  const submit = useMutation(
    trpc.review.submit.mutationOptions({
      // The comment box empties as soon as you send; it comes back if GitHub says no.
      onMutate: () => {
        const previous = body
        setBody("")
        return { previous }
      },
      onSuccess: (_data, vars) => {
        onSubmitted?.()
        toast(
          vars.event === "APPROVE"
            ? "Approved"
            : vars.event === "REQUEST_CHANGES"
              ? "Changes requested"
              : "Comment posted"
        )
        void refresh()
      },
      onError: (e, _vars, ctx) => {
        if (ctx) setBody(ctx.previous)
        setError(e.message)
      },
    })
  )
  // Merging marks the PR merged and takes it off the board at once; both come back if the merge is refused.
  const merge = useMutation(
    trpc.review.merge.mutationOptions({
      ...optimistic<unknown>(
        queryClient,
        [
          { filter: trpc.review.get.queryFilter({ repo, number }), patch: (d: { pr: { state: string } }) => ({ ...d, pr: { ...d.pr, state: "merged" } }) },
          { filter: trpc.review.board.queryFilter(), patch: (d: { cards: { repo: string; number: number }[] }) => ({ ...d, cards: d.cards.filter((c) => !(c.repo === repo && c.number === number)) }) },
        ],
        { settled: () => void refresh(), onError: (e) => setError(e.message) },
      ),
      onSuccess: () => toast("Merged"),
    })
  )
  const busy = submit.isPending || merge.isPending

  if (!githubLogin) {
    return (
      <div className="bg-background sticky bottom-0 border-t p-3 text-sm">
        <Link href="/settings/integrations" className="underline">
          Connect your GitHub account
        </Link>{" "}
        to review and merge from here.
      </div>
    )
  }

  function send(event: Event) {
    setError(undefined)
    if (event !== "APPROVE" && !body.trim() && !pending.length) {
      setError("Add a comment first")
      return
    }
    submit.mutate({ repo, number, event, body, comments: pending })
  }

  return (
    <div className="bg-background/95 border-hairline sticky bottom-0 space-y-3 border-t p-4 backdrop-blur">
      <MentionTextarea
        value={body}
        onChange={(v) => {
          setBody(v)
          setError(undefined)
        }}
        rows={2}
        placeholder="Leave a review comment. Type @ to mention someone."
        aria-label="Review comment"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || own} title={own ? "You can't approve your own pull request" : undefined} pending={submit.isPending && submit.variables?.event === "APPROVE"} onClick={() => send("APPROVE")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy || own} title={own ? "You can't request changes on your own pull request" : undefined} pending={submit.isPending && submit.variables?.event === "REQUEST_CHANGES"} onClick={() => send("REQUEST_CHANGES")}>
          Request changes
        </Button>
        <Button size="sm" variant="outline" disabled={busy} pending={submit.isPending && submit.variables?.event === "COMMENT"} onClick={() => send("COMMENT")}>
          Comment
        </Button>
        {canMerge && (
          <span className="flex items-center gap-1">
            <select
              className="border-input bg-raised h-8 rounded-full border px-3 text-xs"
              aria-label="Merge method"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="squash">Squash and merge</option>
              <option value="merge">Create a merge commit</option>
              <option value="rebase">Rebase and merge</option>
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || Boolean(blocked)}
              pending={merge.isPending}
              title={blocked}
              onClick={() => {
                setError(undefined)
                merge.mutate({ repo, number, method })
              }}
            >
              Merge
            </Button>
          </span>
        )}
        {canMerge && blocked && <span className="text-xs text-amber-600">{blocked}</span>}
        {pending.length > 0 && (
          <span className="text-xs">
            {pending.length} pending comment{pending.length > 1 ? "s" : ""} will be sent with your review ·{" "}
            <button type="button" className="underline" onClick={onDiscardPending}>
              discard
            </button>
          </span>
        )}
        <span className="text-muted-foreground text-xs">as {githubLogin}</span>
        {own && <span className="text-muted-foreground text-xs">Your own PR: you can comment, but not approve or request changes.</span>}
        {error && <span role="alert" className="text-destructive text-sm">{error}</span>}
      </div>
    </div>
  )
}
