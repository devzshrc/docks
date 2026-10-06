"use client"

import type { RankedFile } from "@docks/api"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Line = {
  kind: "hunk" | "add" | "del" | "ctx"
  text: string
  oldNo?: number
  newNo?: number
}

/** Unified diff patch (as GitHub returns it) -> numbered lines. */
function parsePatch(patch: string): Line[] {
  const lines: Line[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      lines.push({ kind: "hunk", text: raw })
    } else if (raw.startsWith("+")) {
      lines.push({ kind: "add", text: raw.slice(1), newNo: newNo++ })
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "del", text: raw.slice(1), oldNo: oldNo++ })
    } else if (!raw.startsWith("\\")) {
      lines.push({ kind: "ctx", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return lines
}

const ROW = {
  hunk: "bg-sky-500/10 text-muted-foreground",
  add: "bg-emerald-500/10",
  del: "bg-red-500/10",
  ctx: "",
} as const

const TIER_LABEL = {
  core: null,
  config: "config",
  test: "test",
  noise: "generated / lockfile",
} as const

/** One file diff with Viewed checkbox and "changed since you viewed" state (§5.3). */
export function FileDiff({
  file,
  onViewedChange,
}: {
  file: RankedFile
  onViewedChange: (viewed: boolean) => void
}) {
  // Noise and already-viewed files start collapsed.
  const [open, setOpen] = useState(file.tier !== "noise" && !file.viewed)
  const tier = TIER_LABEL[file.tier]

  return (
    <section id={`file-${file.filename}`} className="scroll-mt-16 rounded-lg border">
      <header className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-[12rem] flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? (
            <IconChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <IconChevronRight className="size-4 shrink-0" aria-hidden />
          )}
          <span className="truncate font-mono text-xs">{file.filename}</span>
        </button>
        {tier && <Badge variant="outline">{tier}</Badge>}
        {file.changedSinceViewed && <Badge variant="secondary">changed since you viewed</Badge>}
        <span className="text-xs whitespace-nowrap">
          <span className="text-emerald-600">+{file.additions}</span>{" "}
          <span className="text-destructive">−{file.deletions}</span>
        </span>
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
        (file.patch ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs leading-5">
              <tbody>
                {parsePatch(file.patch).map((line, i) => (
                  <tr key={i} className={ROW[line.kind]}>
                    {line.kind === "hunk" ? (
                      <td colSpan={3} className="px-3">
                        {line.text}
                      </td>
                    ) : (
                      <>
                        <td className="text-muted-foreground w-10 px-2 text-right select-none">
                          {line.oldNo}
                        </td>
                        <td className="text-muted-foreground w-10 px-2 text-right select-none">
                          {line.newNo}
                        </td>
                        <td className={cn("px-2 whitespace-pre")}>
                          <span className="text-muted-foreground mr-2 select-none">
                            {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                          </span>
                          {line.text}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            {file.status === "renamed"
              ? "File renamed without changes."
              : "Diff not shown (binary file or too large for GitHub to include)."}
          </p>
        ))}
    </section>
  )
}
