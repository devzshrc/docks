"use client"

import type { RankedFile } from "@docks/api"
import { useMutation, useQuery } from "@tanstack/react-query"
import { IconChevronDown, IconChevronRight, IconMessagePlus } from "@tabler/icons-react"
import hljs from "highlight.js/lib/common"
import { Fragment, useMemo, useState } from "react"

import { MentionTextarea } from "@/components/mention-textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { addedLines, languageFor, parsePatch, toSplit, type DiffLine } from "@/lib/diff"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

export type Side = "LEFT" | "RIGHT"
export type PendingComment = { path: string; line: number; side: Side; body: string }
export type Thread = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  diffSide: Side
  comments: { id: number; author: string; body: string; createdAt: string }[]
}

const ROW = { hunk: "bg-sky-500/10 text-muted-foreground", add: "bg-emerald-500/10", del: "bg-red-500/10", ctx: "" } as const
const TIER_LABEL = { core: null, config: "config", test: "test", noise: "generated / lockfile" } as const

/** ponytail: per-line highlighting; multi-line strings/comments may mis-colour. Switch to shiki if users notice. */
function Code({ text, language }: { text: string; language: string | null }) {
  const html = useMemo(() => {
    if (!language || !hljs.getLanguage(language)) return null
    try {
      return hljs.highlight(text, { language, ignoreIllegals: true }).value
    } catch {
      return null
    }
  }, [text, language])
  return html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{text}</span>
}

function Composer({
  path,
  line,
  side,
  lineText,
  repo,
  number,
  onAddPending,
  onPosted,
  onCancel,
}: {
  path: string
  line: number
  side: Side
  lineText: string
  repo: string
  number: number
  onAddPending: (c: PendingComment) => void
  onPosted: () => void
  onCancel: () => void
}) {
  const trpc = useTRPC()
  const [body, setBody] = useState("")
  const post = useMutation(trpc.review.comment.mutationOptions({ onSuccess: onPosted }))
  return (
    <div className="bg-muted/40 space-y-2 border-y p-2 font-sans">
      <MentionTextarea value={body} onChange={setBody} rows={3} autoFocus placeholder="Comment on this line" aria-label={`Comment on line ${line}`} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!body.trim()} onClick={() => onAddPending({ path, line, side, body })}>
          Add to review
        </Button>
        <Button size="sm" variant="outline" disabled={!body.trim() || post.isPending} onClick={() => post.mutate({ repo, number, path, line, side, body })}>
          Comment now
        </Button>
        {side === "RIGHT" && (
          <Button size="sm" variant="ghost" onClick={() => setBody((b) => `${b}${b ? "\n" : ""}\`\`\`suggestion\n${lineText}\n\`\`\``)}>
            Suggest change
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {post.error && <span className="text-destructive text-sm">{post.error.message}</span>}
      </div>
    </div>
  )
}

function ThreadView({ thread, repo, number, canAct, onChanged }: { thread: Thread; repo: string; number: number; canAct: boolean; onChanged: () => void }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(!thread.isResolved)
  const [reply, setReply] = useState("")
  const send = useMutation(trpc.review.reply.mutationOptions({ onSuccess: () => { setReply(""); onChanged() } }))
  const resolve = useMutation(trpc.review.resolveThread.mutationOptions({ onSuccess: onChanged }))
  return (
    <div className="bg-background m-2 rounded-md border font-sans text-sm">
      <button type="button" className="text-muted-foreground flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <IconChevronDown className="size-3" aria-hidden /> : <IconChevronRight className="size-3" aria-hidden />}
        {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
        {thread.isResolved && <Badge variant="secondary">resolved</Badge>}
        {thread.isOutdated && <Badge variant="outline">outdated</Badge>}
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-2">
          {thread.comments.map((c) => (
            <div key={c.id}>
              <div className="text-xs">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {canAct && (
            <div className="space-y-2">
              <MentionTextarea value={reply} onChange={setReply} rows={2} placeholder="Reply" aria-label="Reply" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!reply.trim() || send.isPending} onClick={() => send.mutate({ repo, number, commentId: thread.comments[0]!.id, body: reply })}>
                  Reply
                </Button>
                <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ repo, number, threadId: thread.id, resolve: !thread.isResolved })}>
                  {thread.isResolved ? "Unresolve" : "Resolve"}
                </Button>
                {(send.error ?? resolve.error) && <span className="text-destructive">{(send.error ?? resolve.error)!.message}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One file: diff (unified/split) or full file, line comments, threads, Viewed (§5.3, M6). */
export function FileDiff({
  file,
  onViewedChange,
  repo,
  number,
  threads,
  pending,
  canAct,
  mode,
  onAddPending,
  onThreadsChanged,
  highlightNew,
}: {
  file: RankedFile
  onViewedChange: (viewed: boolean) => void
  repo: string
  number: number
  threads: Thread[]
  pending: PendingComment[]
  canAct: boolean
  mode: "unified" | "split"
  onAddPending: (c: PendingComment) => void
  onThreadsChanged: () => void
  highlightNew?: boolean
}) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(file.tier !== "noise" && !file.viewed)
  const [full, setFull] = useState(false)
  const [composer, setComposer] = useState<{ line: number; side: Side } | null>(null)
  const language = languageFor(file.filename)
  const lines = useMemo(() => (file.patch ? parsePatch(file.patch) : []), [file.patch])
  const content = useQuery({
    ...trpc.review.fileContent.queryOptions({ repo, number, path: file.filename }),
    enabled: full && open,
  })
  const tier = TIER_LABEL[file.tier]

  const at = (side: Side, line?: number) =>
    line === undefined ? [] : threads.filter((t) => t.diffSide === side && t.line === line)
  const pendingAt = (side: Side, line?: number) =>
    line === undefined ? [] : pending.filter((p) => p.side === side && p.line === line)

  function NumberCell({ n, side, text }: { n?: number; side: Side; text: string }) {
    return (
      <td className="text-muted-foreground w-10 px-2 text-right align-top select-none">
        {n !== undefined && canAct ? (
          <button
            type="button"
            className="group relative w-full text-right hover:text-foreground"
            aria-label={`Comment on ${side === "LEFT" ? "old" : "new"} line ${n}`}
            onClick={() => setComposer({ line: n, side })}
            data-text={text}
          >
            <IconMessagePlus className="absolute top-0.5 -left-1 hidden size-3.5 text-sky-500 group-hover:block" aria-hidden />
            {n}
          </button>
        ) : (
          n
        )}
      </td>
    )
  }

  function Extras({ side, line, text, colSpan }: { side: Side; line?: number; text: string; colSpan: number }) {
    const list = at(side, line)
    const mine = pendingAt(side, line)
    const composing = composer && composer.side === side && composer.line === line
    if (!list.length && !mine.length && !composing) return null
    return (
      <tr>
        <td colSpan={colSpan} className="p-0">
          {list.map((t) => (
            <ThreadView key={t.id} thread={t} repo={repo} number={number} canAct={canAct} onChanged={onThreadsChanged} />
          ))}
          {mine.map((p, i) => (
            <div key={i} className="m-2 rounded-md border border-dashed p-2 font-sans text-sm">
              <Badge variant="outline" className="mb-1">pending</Badge>
              <p className="whitespace-pre-wrap">{p.body}</p>
            </div>
          ))}
          {composing && (
            <Composer
              path={file.filename}
              line={line!}
              side={side}
              lineText={text}
              repo={repo}
              number={number}
              onAddPending={(c) => {
                onAddPending(c)
                setComposer(null)
              }}
              onPosted={() => {
                setComposer(null)
                onThreadsChanged()
              }}
              onCancel={() => setComposer(null)}
            />
          )}
        </td>
      </tr>
    )
  }

  function Unified() {
    return (
      <tbody>
        {lines.map((line: DiffLine, i) => {
          if (line.kind === "hunk") {
            return (
              <tr key={i} className={ROW.hunk}>
                <td colSpan={3} className="px-3">{line.text}</td>
              </tr>
            )
          }
          const side: Side = line.kind === "del" ? "LEFT" : "RIGHT"
          const n = side === "LEFT" ? line.oldNo : line.newNo
          return (
            <Fragment key={i}>
              <tr className={ROW[line.kind]}>
                <NumberCell n={line.kind === "add" ? undefined : line.oldNo} side="LEFT" text={line.text} />
                <NumberCell n={line.kind === "del" ? undefined : line.newNo} side="RIGHT" text={line.text} />
                <td className="px-2 whitespace-pre">
                  <span className="text-muted-foreground mr-2 select-none">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</span>
                  <Code text={line.text} language={language} />
                </td>
              </tr>
              <Extras side={side} line={n} text={line.text} colSpan={3} />
              {line.kind === "ctx" && <Extras side="LEFT" line={line.oldNo} text={line.text} colSpan={3} />}
            </Fragment>
          )
        })}
      </tbody>
    )
  }

  function Split() {
    return (
      <tbody>
        {toSplit(lines).map((row, i) => {
          if (row.kind === "hunk") {
            return (
              <tr key={i} className={ROW.hunk}>
                <td colSpan={4} className="px-3">{row.text}</td>
              </tr>
            )
          }
          const { left, right } = row
          return (
            <Fragment key={i}>
              <tr>
                <NumberCell n={left?.oldNo} side="LEFT" text={left?.text ?? ""} />
                <td className={cn("w-1/2 border-r px-2 whitespace-pre", left && ROW[left.kind === "ctx" ? "ctx" : "del"])}>
                  {left && <Code text={left.text} language={language} />}
                </td>
                <NumberCell n={right?.newNo} side="RIGHT" text={right?.text ?? ""} />
                <td className={cn("w-1/2 px-2 whitespace-pre", right && ROW[right.kind === "ctx" ? "ctx" : "add"])}>
                  {right && <Code text={right.text} language={language} />}
                </td>
              </tr>
              <Extras side="LEFT" line={left?.kind === "del" ? left.oldNo : undefined} text={left?.text ?? ""} colSpan={4} />
              <Extras side="RIGHT" line={right?.newNo} text={right?.text ?? ""} colSpan={4} />
            </Fragment>
          )
        })}
      </tbody>
    )
  }

  function FullFile() {
    if (content.isPending) return <tbody><tr><td className="text-muted-foreground px-3 py-4">Loading file…</td></tr></tbody>
    if (content.error) return <tbody><tr><td className="text-destructive px-3 py-4">{content.error.message}</td></tr></tbody>
    const added = file.patch ? addedLines(file.patch) : new Set<number>()
    return (
      <tbody>
        {content.data.text.split("\n").map((text, i) => (
          <tr key={i} className={added.has(i + 1) ? ROW.add : ""}>
            <td className="text-muted-foreground w-12 px-2 text-right select-none">{i + 1}</td>
            <td className="px-2 whitespace-pre">
              <Code text={text} language={language} />
            </td>
          </tr>
        ))}
      </tbody>
    )
  }

  const threadCount = threads.filter((t) => !t.isResolved).length

  return (
    <section id={`file-${file.filename}`} className="scroll-mt-16 rounded-lg border">
      <header className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-[12rem] flex-1 items-center gap-2 text-left" aria-expanded={open}>
          {open ? <IconChevronDown className="size-4 shrink-0" aria-hidden /> : <IconChevronRight className="size-4 shrink-0" aria-hidden />}
          <span className="truncate font-mono text-xs">{file.filename}</span>
        </button>
        {tier && <Badge variant="outline">{tier}</Badge>}
        {file.changedSinceViewed && <Badge variant="secondary">changed since you viewed</Badge>}
        {highlightNew && <Badge variant="secondary">new since your review</Badge>}
        {threadCount > 0 && <Badge variant="outline">{threadCount} open thread{threadCount > 1 ? "s" : ""}</Badge>}
        <span className="text-xs whitespace-nowrap">
          <span className="text-emerald-600">+{file.additions}</span> <span className="text-destructive">−{file.deletions}</span>
        </span>
        {open && file.status !== "removed" && (
          <button type="button" className="text-xs underline-offset-4 hover:underline" onClick={() => setFull((f) => !f)}>
            {full ? "Show diff" : "Show full file"}
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <input
            type="checkbox"
            className="size-4"
            checked={file.viewed}
            onChange={(e) => {
              onViewedChange(e.target.checked)
              if (e.target.checked) setOpen(false)
            }}
          />
          Viewed
        </label>
      </header>
      {open &&
        (full || file.patch ? (
          <div className="overflow-x-auto">
            <table className="font-code w-full border-collapse text-[12.5px] leading-5">
              {full ? <FullFile /> : mode === "split" ? <Split /> : <Unified />}
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            {file.status === "renamed" ? "File renamed without changes." : "Diff not shown (binary file or too large for GitHub to include)."}
          </p>
        ))}
    </section>
  )
}
