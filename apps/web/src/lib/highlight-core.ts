import hljs from "highlight.js/lib/common"

/**
 * Highlights one code stream (all the old-side or all the new-side lines of a hunk) in a single pass, so a string
 * or comment that spans lines colours correctly, then splits the markup back into one HTML string per line.
 * Shared by the worker and the main-thread fallback; imported only from those two, never from components.
 */
export function highlightStream(language: string, lines: string[]): string[] {
  if (!hljs.getLanguage(language) || lines.length === 0) return []
  const html = hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value
  return splitHtmlLines(html, lines.length)
}

/** Splits highlighted markup on newlines, closing open spans at each line end and reopening them on the next. */
export function splitHtmlLines(html: string, expected: number): string[] {
  const out: string[] = []
  const open: string[] = []
  let cur = ""
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === "\n") {
      out.push(cur + "</span>".repeat(open.length))
      cur = open.join("")
    } else {
      if (part.startsWith("<span")) open.push(part)
      else if (part === "</span>") open.pop()
      cur += part
    }
  }
  out.push(cur + "</span>".repeat(open.length))
  // Markup that didn't line up with the source is worse than plain text, so report nothing.
  return out.length === expected ? out : []
}
