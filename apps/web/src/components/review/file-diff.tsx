"use client"

import type { RankedFile } from "@docks/api"
import { useMutation, useQuery } from "@tanstack/react-query"
import { IconChevronDown, IconChevronRight, IconMessagePlus } from "@tabler/icons-react"
import hljs from "highlight.js/lib/common"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"

import { MentionTextarea } from "@/components/mention-textarea"
import { FixWithAgent } from "@/components/review/agent-handoff"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  addedLines,
  changedSymbols,
  COMMENT_LABELS,
  commentLabel,
  languageFor,
  pairChanges,
  parsePatch,
  toSplit,
  withContext,
  wordRange,
  type CommentLabel,
  type DiffLine,
} from "@/lib/diff"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

export type Side = "LEFT" | "RIGHT"
export type PendingComment = { path: string; line: number; startLine?: number; side: Side; body: string }
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
/** Rows rendered before "Show all"; keeps 5k-line generated diffs from freezing the page. */
const ROW_CAP = 400
const TIER_LABEL = { core: null, config: "config", test: "test", noise: "generated / lockfile" } as const

const LABEL_STYLE: Record<CommentLabel, string> = {
  nit: "bg-muted text-muted-foreground",
  question: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  suggestion: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  blocking: "bg-red-500/15 text-red-700 dark:text-red-300",
  praise: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}

function LabelBadge({ body }: { body: string }) {
  const label = commentLabel(body)
  return label ? <span className={cn("rounded px-1.5 py-px text-[10.5px] font-medium", LABEL_STYLE[label])}>{label}</span> : null
}

/** Word-level change marks use the CSS Custom Highlight API: no extra DOM, works on top of hljs markup. */
let words: { add: Highlight; del: Highlight } | null | undefined
function wordHighlights() {
  if (words === undefined) {
    words = typeof CSS !== "undefined" && "highlights" in CSS ? { add: new Highlight(), del: new Highlight() } : null
    if (words) {
      CSS.highlights.set("word-add", words.add)
      CSS.highlights.set("word-del", words.del)
    }
  }
  return words
}

function rangeIn(root: Node, [start, end]: [number, number]) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let pos = 0
  let began = false
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = n.textContent!.length
    if (!began && start <= pos + len) {
      range.setStart(n, start - pos)
      began = true
    }
    if (began && end <= pos + len) {
      range.setEnd(n, end - pos)
      return range
    }
    pos += len
  }
  return null
}

/** ponytail: per-line highlighting; multi-line strings/comments may mis-colour. Switch to shiki if users notice. */
function Code({ text, language, mark, kind }: { text: string; language: string | null; mark?: [number, number] | null; kind?: "add" | "del" }) {
  const ref = useRef<HTMLSpanElement>(null)
  const html = useMemo(() => {
    if (!language || !hljs.getLanguage(language)) return null
    try {
      return hljs.highlight(text, { language, ignoreIllegals: true }).value
    } catch {
      return null
    }
  }, [text, language])
  useEffect(() => {
    const set = wordHighlights()?.[kind ?? "add"]
    const range = mark && kind && set && ref.current ? rangeIn(ref.current, mark) : null
    if (!range) return
    set!.add(range)
    return () => void set!.delete(range)
  }, [html, text, mark?.[0], mark?.[1], kind])
  return html ? <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} /> : <span ref={ref}>{text}</span>
}

function Composer({
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
  path: string
  line: number
  startLine?: number
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
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">{startLine ? `Lines ${startLine}–${line}` : `Line ${line}`}</span>
        {COMMENT_LABELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={commentLabel(body) === l}
            onClick={() => setBody((b) => `**${l}:** ${b.replace(/^\**\s*\w+\s*(\([^)]*\))?\s*:\**\s*/, "")}`)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
              commentLabel(body) === l ? LABEL_STYLE[l] : "text-muted-foreground hover:bg-muted"
            )}
          >
            {l}
          </button>
        ))}
        {!startLine && <span className="text-muted-foreground/70 ml-auto text-[11px]">Shift-click another line number to select a range</span>}
      </div>
      <MentionTextarea value={body} onChange={setBody} rows={3} autoFocus placeholder="Leave a comment" aria-label={`Comment on line ${line}`} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!body.trim()} onClick={() => onAddPending({ path, line, startLine, side, body })}>
          Add to review
        </Button>
        <Button size="sm" variant="outline" disabled={!body.trim() || post.isPending} onClick={() => post.mutate({ repo, number, path, line, startLine, side, body })}>
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

function ThreadView({ thread, repo, number, branch, canAct, onChanged }: { thread: Thread; repo: string; number: number; branch: string; canAct: boolean; onChanged: () => void }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(!thread.isResolved)
  const [reply, setReply] = useState("")
  const send = useMutation(trpc.review.reply.mutationOptions({ onSuccess: () => { setReply(""); onChanged() } }))
  const resolve = useMutation(trpc.review.resolveThread.mutationOptions({ onSuccess: onChanged }))
  return (
    <div className="bg-background m-2 rounded-md border font-sans text-sm">
      <div className="flex items-center gap-2 pr-1.5">
        <button type="button" className="text-muted-foreground flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <IconChevronDown className="size-3" aria-hidden /> : <IconChevronRight className="size-3" aria-hidden />}
          {thread.comments[0] && <LabelBadge body={thread.comments[0].body} />}
          {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
          {thread.isResolved && <Badge variant="secondary">resolved</Badge>}
          {thread.isOutdated && <Badge variant="outline">outdated</Badge>}
        </button>
        {!thread.isResolved && (
          <FixWithAgent context={{ repo, number, branch, path: thread.path, line: thread.line, comments: thread.comments }} />
        )}
      </div>
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
  branch,
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
  branch: string
}) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(file.tier !== "noise" && !file.viewed)
  const [view, setView] = useState<"diff" | "full" | "preview">("diff")
  const full = view !== "diff"
  const [showAll, setShowAll] = useState(false)
  const section = useRef<HTMLElement>(null)
  // Mount a file's rows only once it's near the viewport: a 300-file PR opens instantly.
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = section.current
    if (!el || near) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "1200px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  // Jumping here (rail, file finder, outline) expands a collapsed file.
  useEffect(() => {
    const onHash = () => {
      if (decodeURIComponent(location.hash) === `#file-${file.filename}`) {
        setOpen(true)
        setNear(true)
      }
    }
    onHash()
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [file.filename])
  const [composer, setComposer] = useState<{ line: number; startLine?: number; side: Side } | null>(null)
  const [above, setAbove] = useState<Record<number, number>>({})
  const language = languageFor(file.filename)
  const isMarkdown = language === "markdown"
  const lines = useMemo(() => (file.patch ? parsePatch(file.patch) : []), [file.patch])
  const symbols = useMemo(() => changedSymbols(lines).slice(0, 12), [lines])
  const pairs = useMemo(() => pairChanges(lines), [lines])
  const content = useQuery({
    ...trpc.review.fileContent.queryOptions({ repo, number, path: file.filename }),
    enabled: (full || Object.keys(above).length > 0) && open,
  })
  const fileLines = useMemo(() => content.data?.text.split("\n"), [content.data])
  const shown = useMemo(() => withContext(lines, fileLines, above), [lines, fileLines, above])
  const capped = !showAll && shown.length > ROW_CAP
  const markFor = (l?: DiffLine) => {
    const other = l && pairs.get(l)
    return other ? wordRange(l.text, other.text) : null
  }
  const selected = (side: Side, n?: number) =>
    composer?.startLine !== undefined && n !== undefined && composer.side === side && n >= composer.startLine && n <= composer.line
  const tier = TIER_LABEL[file.tier]

  const at = (side: Side, line?: number) =>
    line === undefined ? [] : threads.filter((t) => t.diffSide === side && t.line === line)
  const pendingAt = (side: Side, line?: number) =>
    line === undefined ? [] : pending.filter((p) => p.side === side && p.line === line)

  function pick(e: React.MouseEvent, n: number, side: Side) {
    if (e.shiftKey && composer && composer.side === side && n !== composer.line) {
      const lo = Math.min(n, composer.startLine ?? composer.line, composer.line)
      const hi = Math.max(n, composer.line)
      setComposer({ side, line: hi, startLine: lo })
    } else setComposer({ line: n, side })
  }

  function NumberCell({ n, side, text, extra }: { n?: number; side: Side; text: string; extra?: boolean }) {
    return (
      <td className={cn("text-muted-foreground w-10 px-2 text-right align-top select-none", selected(side, n) && "bg-sky-500/20")}>
        {n !== undefined && canAct && !extra ? (
          <button
            type="button"
            className="group relative w-full text-right hover:text-foreground"
            aria-label={`Comment on ${side === "LEFT" ? "old" : "new"} line ${n}`}
            onClick={(e) => pick(e, n, side)}
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
            <ThreadView key={t.id} thread={t} repo={repo} number={number} branch={branch} canAct={canAct} onChanged={onThreadsChanged} />
          ))}
          {mine.map((p, i) => (
            <div key={i} className="m-2 rounded-md border border-dashed p-2 font-sans text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline">pending</Badge>
                  <LabelBadge body={p.body} />
                  {p.startLine && <span className="text-muted-foreground text-xs">lines {p.startLine}–{p.line}</span>}
                </span>
                <FixWithAgent context={{ repo, number, branch, path: p.path, line: p.line, comments: [{ author: "you", body: p.body }] }} />
              </div>
              <p className="whitespace-pre-wrap">{p.body}</p>
            </div>
          ))}
          {composing && (
            <Composer
              path={file.filename}
              line={line!}
              startLine={composer.startLine}
              side={side}
              lineText={
                composer.startLine
                  ? lines
                      .filter((l) => l.kind !== "hunk" && (side === "LEFT" ? l.kind !== "add" && l.oldNo! >= composer.startLine! && l.oldNo! <= line! : l.kind !== "del" && l.newNo! >= composer.startLine! && l.newNo! <= line!))
                      .map((l) => l.text)
                      .join("\n")
                  : text
              }
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

  function HunkRow({ text, hunk, lastNew, colSpan }: { text: string; hunk: number; lastNew: number; colSpan: number }) {
    const gap = Number(text.match(/\+(\d+)/)?.[1] ?? 1) - 1 - lastNew
    return (
      <tr className={ROW.hunk} data-hunk={hunk}>
        <td colSpan={colSpan} className="px-3">
          <span className="flex items-center gap-3">
            {above[hunk] !== undefined && content.isError ? (
              <span className="text-destructive font-sans text-[11px]">Couldn&apos;t load more lines</span>
            ) : above[hunk] !== undefined && content.isPending ? (
              <span className="font-sans text-[11px]">Loading…</span>
            ) : gap > 0 && file.status !== "added" && (
              <button
                type="button"
                onClick={() => setAbove((a) => ({ ...a, [hunk]: (a[hunk] ?? 0) + 20 }))}
                className="hover:text-foreground hover:bg-background/60 -ml-1.5 rounded px-1.5 font-sans text-[11px] transition-colors"
                title={`${gap} hidden line${gap === 1 ? "" : "s"} above`}
              >
                ↑ {Math.min(gap, 20)} more
              </button>
            )}
            <span className="truncate">{text}</span>
          </span>
        </td>
      </tr>
    )
  }

  function Unified() {
    let hunk = -1
    let lastNew = 0
    return (
      <tbody>
        {(capped ? shown.slice(0, ROW_CAP) : shown).map((line: DiffLine, i) => {
          if (line.kind === "hunk") {
            hunk++
            return <HunkRow key={i} text={line.text} hunk={hunk} lastNew={lastNew} colSpan={3} />
          }
          if (line.newNo) lastNew = line.newNo
          const side: Side = line.kind === "del" ? "LEFT" : "RIGHT"
          const n = side === "LEFT" ? line.oldNo : line.newNo
          return (
            <Fragment key={i}>
              <tr className={cn(ROW[line.kind], line.extra && "text-muted-foreground bg-muted/30")}>
                <NumberCell n={line.kind === "add" ? undefined : line.oldNo} side="LEFT" text={line.text} extra={line.extra} />
                <NumberCell n={line.kind === "del" ? undefined : line.newNo} side="RIGHT" text={line.text} extra={line.extra} />
                <td className="px-2 whitespace-pre">
                  <span className="text-muted-foreground mr-2 select-none">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</span>
                  <Code text={line.text} language={language} mark={markFor(line)} kind={line.kind === "del" ? "del" : "add"} />
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
    let hunk = -1
    let lastNew = 0
    const rows = toSplit(shown)
    return (
      <tbody>
        {(capped ? rows.slice(0, ROW_CAP) : rows).map((row, i) => {
          if (row.kind === "hunk") {
            hunk++
            return <HunkRow key={i} text={row.text} hunk={hunk} lastNew={lastNew} colSpan={4} />
          }
          const { left, right } = row
          if (right?.newNo) lastNew = right.newNo
          return (
            <Fragment key={i}>
              <tr>
                <NumberCell n={left?.oldNo} side="LEFT" text={left?.text ?? ""} extra={left?.extra} />
                <td className={cn("w-1/2 border-r px-2 whitespace-pre", left && ROW[left.kind === "ctx" ? "ctx" : "del"], left?.extra && "text-muted-foreground bg-muted/30")}>
                  {left && <Code text={left.text} language={language} mark={markFor(left)} kind="del" />}
                </td>
                <NumberCell n={right?.newNo} side="RIGHT" text={right?.text ?? ""} extra={right?.extra} />
                <td className={cn("w-1/2 px-2 whitespace-pre", right && ROW[right.kind === "ctx" ? "ctx" : "add"], right?.extra && "text-muted-foreground bg-muted/30")}>
                  {right && <Code text={right.text} language={language} mark={markFor(right)} kind="add" />}
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
    if (view === "preview") return <tbody><tr><td><MarkdownPreview text={content.data.text} /></td></tr></tbody>
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
    <section ref={section} id={`file-${file.filename}`} data-viewed={file.viewed || undefined} className="scroll-mt-16 rounded-lg border">
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
          <div className="segmented text-xs" role="group" aria-label="File view">
            {(["diff", "full", ...(isMarkdown ? (["preview"] as const) : [])] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "diff" ? "Diff" : v === "full" ? "File" : "Preview"}
              </button>
            ))}
          </div>
        )}
        <FixWithAgent
          label="Agent"
          context={{
            repo, number, branch, path: file.filename, line: null,
            comments: threads.filter((t) => !t.isResolved).flatMap((t) => t.comments.map((c) => ({ ...c, line: t.line }))),
          }}
        />
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
      {open && view === "diff" && symbols.length > 0 && (
        <nav aria-label="Changed symbols" className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
          <span className="text-muted-foreground mr-1 text-[11px]">Outline</span>
          {symbols.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => section.current?.querySelector(`[data-hunk="${s.hunk}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
              className="bg-muted text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-1.5 py-0.5 font-code text-[11px] transition-colors"
            >
              {s.name}
            </button>
          ))}
        </nav>
      )}
      {open && !near && (
        <div aria-hidden style={{ height: Math.min(lines.length, ROW_CAP) * 20 }} />
      )}
      {open &&
        near &&
        (full || file.patch ? (
          <div className={cn(view !== "preview" && "overflow-x-auto")}>
            {view === "preview" ? (
              <table className="w-full"><FullFile /></table>
            ) : (
              <table className="font-code w-full border-collapse text-[12.5px] leading-5">
                {full ? <FullFile /> : mode === "split" ? <Split /> : <Unified />}
              </table>
            )}
            {!full && capped && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 w-full border-t py-2 text-xs transition-colors"
              >
                Show all {shown.length.toLocaleString()} lines
              </button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            {file.status === "renamed" ? "File renamed without changes." : "Diff not shown (binary file or too large for GitHub to include)."}
          </p>
        ))}
    </section>
  )
}
