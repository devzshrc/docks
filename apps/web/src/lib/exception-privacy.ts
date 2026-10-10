/** Scrub exception diagnostics before export; omit source context and credential properties. */
export function sanitizeException(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (typeof value === "string") {
    return value
      .replace(/https?:\/\/[^\s)]+/g, (raw) => {
        try {
          const url = new URL(raw);
          url.search = "";
          url.hash = "";
          url.username = "";
          url.password = "";
          return url.toString();
        } catch {
          return "[url redacted]";
        }
      })
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
      .replace(
        /((?:password|secret|token|api[_-]?key|authorization|cookie)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1[redacted]",
      )
      .replace(
        /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/g,
        "[redacted]",
      )
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
      .slice(0, 8000);
  }
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => sanitizeException(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(pre_context|post_context|context_line|vars|locals|email|name|password|secret|token|authorization|cookie)$/i.test(
              key,
            ),
        )
        .map(([key, item]) => [key, sanitizeException(item, depth + 1)]),
    );
  return value;
}
