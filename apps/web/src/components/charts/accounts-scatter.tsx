"use client"

import type { Account } from "@docks/api"
import { colorLegend, defineChart, dot } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { tooltip } from "@tanstack/charts/tooltip"
import { useMemo, useState } from "react"

const SEGMENTS = ["Free", "Team"] as const
const SEGMENT_COLORS = ["#94a3b8", "#2563eb"]
const R_MIN = 4
const R_MAX = 22

const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Explicit square-root radius scale: area (not radius) grows with seats, so a
 * 4× larger account reads as 4× the ink. Domain is [0, max seats].
 */
function sqrtRadius(maxSeats: number) {
  const max = Math.max(1, maxSeats)
  return (seats: number) => R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.min(seats, max) / max)
}

/**
 * Accounts by revenue (x) and retention (y), sized by seats, colored by segment.
 * Domains for x and y are inferred by the compact linear scale. The original
 * Account rows flow through to the tooltip and focus callback, fully typed.
 */
export function AccountsScatter({ accounts }: { accounts: Account[] }) {
  const [focused, setFocused] = useState<Account | null>(null)

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          dot(accounts, {
            key: "id",
            x: "monthlyRevenue",
            y: "retention",
            r: "seats",
            rScale: sqrtRadius(Math.max(...accounts.map((a) => a.seats))),
            color: "segment",
            fillOpacity: 0.75,
            stroke: "white",
            strokeWidth: 1,
          }),
        ],
        scales: {
          x: { scale: scaleLinear, grid: true, axis: { label: "Monthly revenue (USD)", ticks: { format: (v: number) => usd(v) } } },
          y: { scale: scaleLinear, grid: true, axis: { label: "Retention (28-day active seats)", ticks: { format: (v: number) => pct(v) } } },
        },
        color: {
          domain: [...SEGMENTS],
          range: SEGMENT_COLORS,
          legend: colorLegend({ label: "Segment" }),
        },
        tooltip: {
          use: tooltip,
          format: (point) =>
            [
              point.datum.name,
              `${point.datum.segment} · ${point.datum.seats} seat${point.datum.seats === 1 ? "" : "s"}`,
              `Revenue ${usd(point.datum.monthlyRevenue)}/mo`,
              `Retention ${pct(point.datum.retention)}`,
            ].join("\n"),
        },
      }),
    [accounts]
  )

  return (
    <div className="space-y-2">
      <Chart
        definition={definition}
        height={360}
        ariaLabel={`Scatterplot of ${accounts.length} accounts: monthly revenue on the x-axis, 28-day seat retention on the y-axis, point size by seats, color by segment (Free or Team).`}
        onFocusChange={(point) => setFocused(point?.datum ?? null)}
      />
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {focused
          ? `${focused.name}: ${focused.segment}, ${focused.seats} seats, ${usd(focused.monthlyRevenue)}/mo, ${pct(focused.retention)} retention`
          : "Hover or use arrow keys to inspect an account. Larger points have more seats."}
      </p>
    </div>
  )
}
