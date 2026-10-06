"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

import { MentionTextarea } from "@/components/mention-textarea"
import { Button } from "@/components/ui/button"
import { useTRPC } from "@/trpc/react"

type Event = "APPROVE" | "REQUEST_CHANGES" | "COMMENT"

/** Approve, request changes, comment, merge (§5.3). */
export function ReviewActions({
  repo,
  number,
  canMerge,
  githubLogin,
}: {
  repo: string
  number: number
  canMerge: boolean
  githubLogin: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [body, setBody] = useState("")
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
    if (event !== "APPROVE" && !body.trim()) {
      setError("Add a comment first")
      return
    }
    submit.mutate({ repo, number, event, body })
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
        <Button size="sm" disabled={busy} onClick={() => send("APPROVE")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => send("REQUEST_CHANGES")}>
          Request changes
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => send("COMMENT")}>
          Comment
        </Button>
        {canMerge && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setError(undefined)
              setDone(undefined)
              merge.mutate({ repo, number, method: "squash" })
            }}
          >
            Squash and merge
          </Button>
        )}
        <span className="text-muted-foreground text-xs">as {githubLogin}</span>
        {error && <span className="text-destructive text-sm">{error}</span>}
        {done && <span className="text-sm text-emerald-600">{done}</span>}
      </div>
    </div>
  )
}
