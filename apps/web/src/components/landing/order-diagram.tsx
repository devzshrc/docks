"use client"

import { useEffect, useRef, useState } from "react"

const FILES = [
  { name: "package.json", add: 1, del: 0, to: 2 },
  { name: "src/auth/login.ts", add: 14, del: 2, to: 1 },
  { name: "tests/rate-limit.test.ts", add: 9, del: 0, to: 2 },
  { name: "src/rate-limit.ts", add: 14, del: 0, to: 0 },
  { name: "pnpm-lock.yaml", add: 120, del: 4, to: -1 },
  { name: "src/auth/session.ts", add: 6, del: 1, to: 1 },
]

const STEPS = [
  { title: "Rate limiter", why: "The new idea. Start here.", files: 1 },
  { title: "Login flow", why: "Where the limiter is wired in.", files: 2 },
  { title: "Tests and tooling", why: "Proof it works; check last.", files: 2 },
]

const ROW = 46
const TOP = 44
const CARD_Y = (i: number) => TOP + i * 96
const LEFT_W = 260
const RIGHT_X = 500

/**
 * The product in one picture: files in the order GitHub lists them, routed into the order Docks asks you to read
 * them. Lines draw in once, when the diagram scrolls into view.
 */
export function OrderDiagram() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} data-visible={visible}>

      {/* Mobile: the same idea as an ordered list */}
      <ol className="space-y-2 md:hidden">
        {STEPS.map((s, i) => (
          <li key={s.title} className="bg-card border-hairline flex items-start gap-3 rounded-xl border p-4">
            <span className="text-text-3 font-mono text-xs">0{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="text-muted-foreground block text-xs">{s.why}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
