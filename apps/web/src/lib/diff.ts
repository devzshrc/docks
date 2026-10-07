/** Unified-diff parsing shared by the diff views (plan M6). Pure; unit-tested via the web typecheck + usage. */

export type DiffLine = {
  kind: "hunk" | "add" | "del" | "ctx"
  text: string
  oldNo?: number
  newNo?: number
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

/** Subsequence fuzzy match; higher is better, null when not a match. Favours file-name hits and runs. */
export function fuzzyScore(query: string, path: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "")
  if (!q) return 0
  const p = path.toLowerCase()
  const nameStart = p.lastIndexOf("/") + 1
  let score = 0
  let pi = 0
  let prev = -2
  for (const ch of q) {
    const at = p.indexOf(ch, pi)
    if (at === -1) return null
    score += at === prev + 1 ? 3 : 1
    if (at >= nameStart) score += 2
    if (at === nameStart || p[at - 1] === "/" || p[at - 1] === "." || p[at - 1] === "-" || p[at - 1] === "_") score += 2
    prev = at
    pi = at + 1
  }
  return score - p.length * 0.01
}
