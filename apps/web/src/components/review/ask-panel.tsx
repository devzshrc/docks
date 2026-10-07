"use client"

import { useMutation } from "@tanstack/react-query"
import { IconMessageQuestion } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTRPC } from "@/trpc/react"

type Turn = { role: "user" | "assistant"; content: string }

/** Turn "path:line" citations into links that jump to the file. */
function withLinks(text: string) {
  const parts = text.split(/([\w./@-]+\.\w+:\d+)/g)
  return parts.map((part, i) => {
    const m = part.match(/^([\w./@-]+\.\w+):(\d+)$/)
    return m ? (
      <a key={i} href={`#file-${m[1]}`} className="font-mono text-xs underline">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  })
}

/** Ask questions about the PR; answers come from the diff (plan M6). */
export function AskPanel({ repo, number }: { repo: string; number: number }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const ask = useMutation(
    trpc.review.ask.mutationOptions({
      onSuccess: (res, vars) =>
        setTurns((t) => [...t, { role: "user", content: vars.question }, { role: "assistant", content: res.answer }]),
    })
  )

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <IconMessageQuestion className="size-4" aria-hidden />
        Ask about this PR
      </Button>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border p-4 text-sm" aria-label="Ask about this PR">
      {turns.map((t, i) => (
        <div key={i} className={t.role === "user" ? "font-medium" : "text-muted-foreground whitespace-pre-wrap"}>
          {t.role === "assistant" ? withLinks(t.content) : t.content}
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!question.trim()) return
          ask.mutate({ repo, number, question, history: turns })
          setQuestion("")
        }}
      >
        <Input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What calls this function? Is the new path tested?"
          aria-label="Question about this PR"
        />
        <Button type="submit" disabled={ask.isPending}>
          {ask.isPending ? "Thinking…" : "Ask"}
        </Button>
      </form>
      {ask.error && <p className="text-destructive">{ask.error.message}</p>}
      <p className="text-muted-foreground text-xs">Answers come from the diff and can be wrong. Check the code.</p>
    </section>
  )
}
