"use client"

import { useTheme } from "next-themes"
import { useEffect, useId, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/** Mermaid is ~1 MB, so it loads only when a file actually contains a diagram. */
function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/:/g, "")
  const { resolvedTheme } = useTheme()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: resolvedTheme === "dark" ? "dark" : "neutral" })
      try {
        const out = await mermaid.render(`m${id}`, code)
        if (live) setSvg(out.svg)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't render diagram")
      }
    })
    return () => {
      live = false
    }
  }, [code, id, resolvedTheme])
  if (error) return <pre className="text-destructive text-xs">{error}</pre>
  if (!svg) return <div className="text-muted-foreground py-6 text-center text-xs">Rendering diagram…</div>
  return <div className="flex justify-center overflow-x-auto py-2 [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Rendered view of a Markdown file in the PR (head commit). */
export function MarkdownPreview({ text }: { text: string }) {
  return (
    <div className="prose-docks px-6 py-5 text-[14px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...rest }) {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1]
            if (lang === "mermaid") return <Mermaid code={String(children).trim()} />
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            )
          },
          a: ({ children, ...rest }) => (
            <a {...rest} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
