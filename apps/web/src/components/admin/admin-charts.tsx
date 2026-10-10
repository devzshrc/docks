"use client";

import { useMemo } from "react";
import { barX, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import type { TrendRow } from "@/components/charts/trend-chart";

const theme = {
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  background: "transparent",
};
const count = (value: number) =>
  Number.isInteger(value) ? value.toLocaleString() : "";
const chartClassName =
  "w-full text-muted-foreground [--ts-chart-tooltip-background:var(--popover)] [--ts-chart-tooltip-color:var(--popover-foreground)]";

export function AdminTrendChart({
  rows,
  label,
  ariaLabel,
  color = "var(--chart-1)",
  height = 220,
}: {
  rows: TrendRow[];
  label: string;
  ariaLabel: string;
  color?: string;
  height?: number;
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
            strokeWidth: 2.5,
          }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.25) },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { ticks: { format: count } },
          },
        },
        theme,
        tooltip: {
          use: tooltip,
          items: [
            { channel: "x", label: "Date" },
            { channel: "y", label },
          ],
        },
      }),
    [rows, color, label],
  );
  if (!rows.some((row) => row.value !== null)) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No data yet.
      </p>
    );
  }
  return (
    <div className="min-w-0" data-admin-chart="trend">
      <Chart
        definition={definition}
        height={height}
        initialWidth={480}
        ariaLabel={ariaLabel}
        ariaDescription={`${label} over time. Use arrow keys to explore each data point.`}
        className={chartClassName}
      />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function AdminActivationChart({ values }: { values: number[] }) {
  const definition = useMemo(() => {
    const rows = [
      "Registered",
      "Created a workspace",
      "Connected GitHub",
      "Submitted a review",
    ].map((label, i) => ({ label, value: values[i] ?? 0 }));
    return defineChart({
      marks: [
        barX(rows, {
          x: "value",
          y: "label",
          fill: "var(--chart-1)",
          radius: 5,
          maxThickness: 26,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { ticks: { format: count } },
        },
        y: { scale: () => scaleBand<string>().padding(0.35) },
      },
      theme,
      tooltip: {
        use: tooltip,
        items: [
          { channel: "y", label: "Step" },
          { channel: "x", label: "Users" },
        ],
      },
    });
  }, [values]);
  return (
    <div className="min-w-0" data-admin-chart="activation">
      <Chart
        definition={definition}
        height={220}
        initialWidth={480}
        ariaLabel="Activation journey"
        ariaDescription="Users progressing from registration to workspace creation, GitHub connection, and their first review. Use arrow keys to inspect counts."
        className={chartClassName}
      />
    </div>
  );
}
