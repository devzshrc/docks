"use client"

import type { RankedFile } from "@docks/api"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef, useState } from "react"

import { FileIcon } from "@/components/file-icon"
import { SlidingHighlight } from "@/components/motion"
import { fuzzyScore } from "@/lib/diff"
import { cn } from "@/lib/utils"

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))

/** `t` opens a fuzzy finder over the PR's files (like GitHub's / px0's file jump). */
export function FileFinder({ files }: { files: RankedFile[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ("")
      setActive(0)
      dialog.current?.showModal()
    } else dialog.current?.close()
  }, [open])

  useEffect(() => {
    list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const results = files
    .map((f) => ({ f, score: fuzzyScore(q, f.filename) }))
    .filter((r): r is { f: RankedFile; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)

  function go(path: string) {
    setOpen(false)
    location.hash = `file-${path}`
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-2 text-sm transition-colors"
      >
        <HugeiconsIcon icon={Search01Icon} size={15} aria-hidden />
        Find file
        <kbd className="bg-muted inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10.5px]">t</kbd>
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        className="bg-popover text-popover-foreground mx-auto mt-[14vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border p-0 shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
        aria-label="Find file"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <HugeiconsIcon icon={Search01Icon} size={18} className="text-muted-foreground shrink-0" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                setActive((a) => (results.length ? (a + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length : 0))
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault()
                go(results[active]!.f.filename)
              }
            }}
            placeholder={`Jump to one of ${files.length} files…`}
            aria-label="Find file"
            className="placeholder:text-muted-foreground/70 h-12 w-full bg-transparent text-[15px] outline-none"
          />
        </div>
        <ul ref={list} role="listbox" className="relative max-h-[min(22rem,50vh)] overflow-y-auto p-2">
          <SlidingHighlight listRef={list} active={active} watch={results.length + q} />
          {results.length === 0 && <li className="text-muted-foreground py-8 text-center text-sm">No matching files</li>}
          {results.map(({ f }, idx) => {
            const parts = f.filename.split("/")
            const name = parts.pop()
            return (
              <li
                key={f.filename}
                role="option"
                data-idx={idx}
                aria-selected={idx === active}
                onMouseMove={() => setActive(idx)}
                onClick={() => go(f.filename)}
                className={cn(
                  "relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5",
                  idx === active && "text-accent-foreground"
                )}
              >
                <FileIcon path={f.filename} />
                <span className="font-code truncate text-[13px]">{name}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{parts.join("/")}</span>
                <span className="font-code shrink-0 text-[10.5px] tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>{" "}
                  <span className="text-rose-600 dark:text-rose-400">−{f.deletions}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </dialog>
    </>
  )
}
