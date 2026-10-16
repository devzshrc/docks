"use client"

import { errorMessage } from "@/lib/error-message";
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { optimistic } from "@/lib/optimistic"
import { useTRPC } from "@/trpc/react"

/** Show and edit a PR's GitHub labels, posted as the signed-in person (plan M5). */
export function LabelsEditor({ repo, number, labels, canAct }: { repo: string; number: number; labels: string[]; canAct: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(labels.join(", "))
  const save = useMutation(
    trpc.review.setLabels.mutationOptions({
      ...optimistic<{ labels: string[] }>(
        queryClient,
        [
          { filter: trpc.review.get.queryFilter({ repo, number }), patch: (d: { pr: { labels: string[] } }, v) => ({ ...d, pr: { ...d.pr, labels: v.labels } }) },
          {
            filter: trpc.review.board.queryFilter(),
            patch: (d: { cards: { repo: string; number: number; labels: string[] }[] }, v) => ({ ...d, cards: d.cards.map((c) => (c.repo === repo && c.number === number ? { ...c, labels: v.labels } : c)) }),
          },
        ],
        { onError: () => setEditing(true) },
      ),
    })
  )

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          setEditing(false)
          save.mutate({ repo, number, labels: value.split(",").map((l) => l.trim()).filter(Boolean) })
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-72" aria-label="Labels, comma-separated" autoFocus />
        <Button size="sm" type="submit" disabled={save.isPending}>Save</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        {save.error && <span className="text-destructive">{errorMessage(save.error)}</span>}
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {labels.length === 0 && <span className="text-muted-foreground">none</span>}
      {labels.map((l) => (
        <Badge key={l} variant="secondary" className="font-normal">{l}</Badge>
      ))}
      {canAct && (
        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setValue(labels.join(", ")); setEditing(true) }}>
          Edit
        </Button>
      )}
    </div>
  )
}
