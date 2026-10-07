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
      {/* Desktop: the routing diagram */}
      <svg viewBox="0 0 800 340" className="hidden h-auto w-full md:block" role="img" aria-label="Six changed files, as GitHub lists them, routed into three steps in the order Docks suggests reading them. The lockfile is set aside.">
        <text x="0" y="16" className="fill-text-3 font-mono" fontSize="11">AS GITHUB LISTS THEM</text>
        <text x={RIGHT_X} y="16" className="fill-text-3 font-mono" fontSize="11">AS DOCKS ASKS YOU TO READ THEM</text>

        {/* connectors (drawn first, under the boxes) */}
        <g fill="none" strokeWidth="1.25">
          {FILES.map((f, i) => {
            const y1 = TOP + i * ROW + 17
            if (f.to < 0) {
              return <path key={f.name} d={`M ${LEFT_W} ${y1} C ${LEFT_W + 120} ${y1}, ${RIGHT_X - 140} 318, ${RIGHT_X} 318`} className="draw-path stroke-border-control" strokeDasharray="3 4" pathLength={1} />
            }
            const y2 = CARD_Y(f.to) + 38
            return <path key={f.name} d={`M ${LEFT_W} ${y1} C ${LEFT_W + 120} ${y1}, ${RIGHT_X - 120} ${y2}, ${RIGHT_X} ${y2}`} className="draw-path stroke-primary" strokeOpacity="0.55" pathLength={1} />
          })}
        </g>

        {FILES.map((f, i) => {
          const y = TOP + i * ROW
          return (
            <g key={f.name} opacity={f.to < 0 ? 0.55 : 1}>
              <rect x="0" y={y} width={LEFT_W} height="34" rx="8" className="fill-card stroke-hairline" />
              <text x="14" y={y + 21} className="fill-foreground font-mono" fontSize="12">{f.name}</text>
              <text x={LEFT_W - 14} y={y + 21} textAnchor="end" className="font-mono" fontSize="11">
                <tspan className="fill-success">+{f.add}</tspan>
                {f.del > 0 && <tspan className="fill-danger"> −{f.del}</tspan>}
              </text>
              <circle cx={LEFT_W} cy={y + 17} r="2.5" className="fill-border-control" />
            </g>
          )
        })}

        {STEPS.map((s, i) => {
          const y = CARD_Y(i)
          return (
            <g key={s.title}>
              <rect x={RIGHT_X} y={y} width="300" height="76" rx="12" className="fill-card stroke-hairline" />
              <circle cx={RIGHT_X} cy={y + 38} r="3" className="fill-primary" />
              <text x={RIGHT_X + 20} y={y + 30} className="fill-text-3 font-mono" fontSize="11">0{i + 1}</text>
              <text x={RIGHT_X + 48} y={y + 30} className="fill-foreground" fontSize="14" fontWeight="500">{s.title}</text>
              <text x={RIGHT_X + 48} y={y + 52} className="fill-muted-foreground" fontSize="12">{s.why}</text>
              <text x={RIGHT_X + 284} y={y + 30} textAnchor="end" className="fill-text-3 font-mono" fontSize="11">{s.files} {s.files === 1 ? "file" : "files"}</text>
            </g>
          )
        })}
        <text x={RIGHT_X + 14} y="322" className="fill-text-3 font-mono" fontSize="11">lockfile set aside</text>
      </svg>

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
