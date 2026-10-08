/** Unified-diff parsing shared by the diff views (plan M6). Pure; unit-tested via the web typecheck + usage. */

export type DiffLine = {
  kind: "hunk" | "add" | "del" | "ctx"
  text: string
  oldNo?: number
  newNo?: number
  /** Context pulled from the full file, not part of the patch (can't be commented on). */
  extra?: boolean
}

/** GitHub's per-file patch -> numbered lines. */
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = []
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

/** New-file line numbers the patch added, for marking them in the full-file view. */
export function addedLines(patch: string): Set<number> {
  return new Set(parsePatch(patch).flatMap((l) => (l.kind === "add" && l.newNo ? [l.newNo] : [])))
}

export type SplitRow =
  | { kind: "hunk"; text: string }
  | { kind: "pair"; left?: DiffLine; right?: DiffLine }

/** Pair removed and added runs side by side; context lines appear on both sides. */
export function toSplit(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ kind: "pair", left: dels[i], right: adds[i] })
    dels = []
    adds = []
  }
  for (const l of lines) {
    if (l.kind === "del") dels.push(l)
    else if (l.kind === "add") adds.push(l)
    else {
      flush()
      rows.push(l.kind === "hunk" ? { kind: "hunk", text: l.text } : { kind: "pair", left: l, right: l })
    }
  }
  flush()
  return rows
}

const EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", go: "go", rb: "ruby", rs: "rust", java: "java", kt: "kotlin",
  cs: "csharp", php: "php", swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
  css: "css", scss: "scss", html: "xml", xml: "xml", vue: "xml", svelte: "xml", astro: "xml",
  json: "json", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", md: "markdown",
  sql: "sql", sh: "bash", bash: "bash", zsh: "bash", dockerfile: "dockerfile",
}

export function languageFor(path: string): string | null {
  const name = path.split("/").pop()!.toLowerCase()
  if (name === "dockerfile") return "dockerfile"
  return EXT[name.split(".").pop() ?? ""] ?? null
}

const DECL =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|def|func|fn|const|let)\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/

/** Symbols a patch touches, each tied to its hunk (0-based), for the file outline. */
export function changedSymbols(lines: DiffLine[]): { name: string; hunk: number }[] {
  const seen = new Map<string, number>()
  let hunk = -1
  for (const l of lines) {
    if (l.kind === "hunk") {
      hunk++
      // Git puts the enclosing function after the second @@.
      const ctx = l.text.replace(/^@@[^@]*@@\s*/, "").match(DECL)?.[1]
      if (ctx && !seen.has(ctx)) seen.set(ctx, hunk)
    } else if (l.kind !== "ctx") {
      const name = l.text.match(DECL)?.[1]
      if (name && !seen.has(name)) seen.set(name, Math.max(hunk, 0))
    }
  }
  return [...seen].map(([name, h]) => ({ name, hunk: h }))
}

export { fuzzyScore } from "@docks/api/issue"

/** Pairs each removed line with the added line that replaced it (i-th del ↔ i-th add in a run). */
export function pairChanges(lines: DiffLine[]): Map<DiffLine, DiffLine> {
  const pairs = new Map<DiffLine, DiffLine>()
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.min(dels.length, adds.length); i++) {
      pairs.set(dels[i]!, adds[i]!)
      pairs.set(adds[i]!, dels[i]!)
    }
    dels = []
    adds = []
  }
  for (const l of lines) {
    if (l.kind === "del") {
      if (adds.length) flush()
      dels.push(l)
    } else if (l.kind === "add") adds.push(l)
    else flush()
  }
  flush()
  return pairs
}

/**
 * The span of `text` that differs from `other` (common prefix/suffix trimmed, snapped to word edges).
 * null when the lines share too little for a word highlight to help.
 * ponytail: prefix/suffix only, one span per line; switch to a token LCS if multi-edit lines need it.
 */
export function wordRange(text: string, other: string): [number, number] | null {
  let a = 0
  while (a < text.length && a < other.length && text[a] === other[a]) a++
  let b = 0
  while (b < text.length - a && b < other.length - a && text[text.length - 1 - b] === other[other.length - 1 - b]) b++
  while (a > 0 && /\w/.test(text[a - 1]!)) a--
  let end = text.length - b
  while (end < text.length && /\w/.test(text[end]!)) end++
  const same = a + (text.length - end)
  if (end <= a || same < text.trim().length * 0.3) return null
  return [a, end]
}

/** Inserts `above[h]` lines of file context before hunk h (from the head file), marked `extra`. */
export function withContext(lines: DiffLine[], file: string[] | undefined, above: Record<number, number>): DiffLine[] {
  if (!file) return lines
  const out: DiffLine[] = []
  let hunk = -1
  let lastNew = 0
  for (const l of lines) {
    if (l.kind === "hunk") {
      hunk++
      const m = l.text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/)
      const n = above[hunk] ?? 0
      if (m && n) {
        const offset = Number(m[1]) - Number(m[2])
        const start = Math.max(lastNew + 1, Number(m[2]) - n)
        for (let k = start; k < Number(m[2]); k++) {
          out.push({ kind: "ctx", text: file[k - 1] ?? "", oldNo: k + offset, newNo: k, extra: true })
        }
      }
    }
    if (l.newNo) lastNew = l.newNo
    out.push(l)
  }
  return out
}

/** Conventional Comments labels, written as a `**label:**` prefix so they read fine on GitHub too. */
export const COMMENT_LABELS = ["nit", "question", "suggestion", "blocking", "praise"] as const
export type CommentLabel = (typeof COMMENT_LABELS)[number]

export function commentLabel(body: string): CommentLabel | null {
  const m = body.trimStart().match(/^\**\s*(nit|question|suggestion|blocking|praise)\s*(?:\([^)]*\))?\s*:/i)
  return m ? (m[1]!.toLowerCase() as CommentLabel) : null
}

/**
 * The old-side and new-side code of each hunk as two separate streams, the way the file would read on either side,
 * so multi-line strings and comments highlight correctly. `lines` index back into `shown` for the result.
 */
export function hunkStreams(shown: DiffLine[]): { old: DiffLine[]; new: DiffLine[] }[] {
  const out: { old: DiffLine[]; new: DiffLine[] }[] = []
  let cur: { old: DiffLine[]; new: DiffLine[] } | null = null
  for (const l of shown) {
    if (l.kind === "hunk" || !cur) {
      cur = { old: [], new: [] }
      out.push(cur)
      if (l.kind === "hunk") continue
    }
    if (l.kind !== "add") cur.old.push(l)
    if (l.kind !== "del") cur.new.push(l)
  }
  return out
}
