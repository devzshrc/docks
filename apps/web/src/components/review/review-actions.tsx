"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

import { MentionTextarea } from "@/components/mention-textarea"
import type { PendingComment } from "@/components/review/file-diff"
import { Button } from "@/components/ui/button"
import { DrawTick } from "@/components/motion"
import { useDraft } from "@/hooks/use-draft"
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
  mergeableState = null,
  pending = [],
  onSubmitted,
  onDiscardPending,
}: {
  repo: string
  number: number
  canMerge: boolean
  githubLogin: string | null
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
  const [done, setDone] = useState<string>()

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.review.get.queryFilter({ repo, number })),
      queryClient.invalidateQueries(trpc.review.board.queryFilter()),
    ])

  const submit = useMutation(
    trpc.review.submit.mutationOptions({
      onSuccess: (_data, vars) => {
        setBody("")
        onSubmitted?.()
        setDone(
          vars.event === "APPROVE"
            ? "Approved"
            : vars.event === "REQUEST_CHANGES"
              ? "Changes requested"
              : "Comment posted"
        )
        void refresh()
      },
      onError: (e) => setError(e.message),
    })
  )
  const merge = useMutation(
    trpc.review.merge.mutationOptions({
      onSuccess: () => {
        setDone("Merged")
        void refresh()
      },
      onError: (e) => setError(e.message),
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
    setDone(undefined)
    if (event !== "APPROVE" && !body.trim() && !pending.length) {
      setError("Add a comment first")
      return
    }
    submit.mutate({ repo, number, event, body, comments: pending })
  }

  return (
    <div className="bg-background sticky bottom-0 space-y-2 border-t p-3">
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
        <Button size="sm" disabled={busy} pending={submit.isPending && submit.variables?.event === "APPROVE"} onClick={() => send("APPROVE")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} pending={submit.isPending && submit.variables?.event === "REQUEST_CHANGES"} onClick={() => send("REQUEST_CHANGES")}>
          Request changes
        </Button>
        <Button size="sm" variant="outline" disabled={busy} pending={submit.isPending && submit.variables?.event === "COMMENT"} onClick={() => send("COMMENT")}>
          Comment
        </Button>
        {canMerge && (
          <span className="flex items-center gap-1">
            <select
              className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
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
                setDone(undefined)
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
        {error && <span role="alert" className="text-destructive text-sm">{error}</span>}
        {done && (
          <span className="animate-in fade-in zoom-in-95 flex items-center gap-1 text-sm text-emerald-600 duration-200">
            <DrawTick className="size-3.5" /> {done}
          </span>
        )}
      </div>
    </div>
  )
}
