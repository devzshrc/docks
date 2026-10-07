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
