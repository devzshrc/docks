"use client"

import { barX, defineChart } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { tooltip } from "@tanstack/charts/tooltip"
import { useMemo } from "react"

export type RankedRow = { name: string; value: number; note?: string }

/** Horizontal bars, largest first (slowest repos, per-person wait, weekly reviewers). */
export function RankedBars({
  rows,
  label,
  ariaLabel,
  format = (v) => String(v),
  color = "#2D6E9E",
}: {
  rows: RankedRow[]
  label: string
  ariaLabel: string
  format?: (v: number) => string
  color?: string
}) {
  const ranked = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows])
  const definition = useMemo(
    () =>
      defineChart({
        marks: [barX(ranked, { x: "value", y: "name", fill: color, inset: 2 })],
        scales: {
          y: { scale: () => scaleBand<string>().domain(ranked.map((r) => r.name)).padding(0.25) },
          x: { scale: scaleLinear, nice: true, grid: true, axis: { label, ticks: { count: 4, format } } },
        },
        tooltip: {
          use: tooltip,
          format: (point) => `${point.datum.name}: ${format(point.datum.value)}${point.datum.note ? ` (${point.datum.note})` : ""}`,
        },
      }),
    [ranked, label, format, color]
  )
  return (
    <div className="anim-reveal">
      <Chart definition={definition} height={Math.max(120, 44 + ranked.length * 30)} ariaLabel={ariaLabel} />
    </div>
  )
}
