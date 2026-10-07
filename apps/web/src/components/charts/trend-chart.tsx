"use client"

import { defineChart, lineY } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scalePoint } from "@tanstack/charts/scales/point"
import { tooltip } from "@tanstack/charts/tooltip"
import { useMemo } from "react"

export type TrendRow = { label: string; value: number | null }

/** One weekly series as a line with points (Insights, admin metrics). */
export function TrendChart({
  rows,
  label,
  ariaLabel,
  format = (v) => String(v),
  color = "#2D6E9E",
  height = 200,
}: {
  rows: TrendRow[]
  label: string
  ariaLabel: string
  format?: (v: number) => string
  color?: string
  height?: number
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(rows, {
            x: "label",
            y: "value",
            points: true,
            stroke: color,
          }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.3) },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label, ticks: { count: 4, format } } },
        },
        tooltip: {
          use: tooltip,
          format: (point) => `Week of ${point.datum.label}: ${point.datum.value === null ? "no data" : format(point.datum.value)}`,
        },
      }),
    [rows, label, format, color]
  )
  return (
    <div className="anim-reveal">
      <Chart definition={definition} height={height} ariaLabel={ariaLabel} />
    </div>
  )
}
