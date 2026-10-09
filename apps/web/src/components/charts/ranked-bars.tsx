"use client";
import { ChartGhost } from "@/components/ui/empty-preview";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
export type RankedRow = { name: string; value: number; note?: string };
export function RankedBars({
  rows,
  label,
  ariaLabel,
  format = (v) => String(v),
  color,
}: {
  rows: RankedRow[];
  label: string;
  ariaLabel: string;
  format?: (v: number) => string;
  color?: string;
}) {
  if (!rows.length)
    return (
      <div className="relative py-4" role="img" aria-label={`${ariaLabel}: no data yet`}>
        <ChartGhost />
        <p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-[13px]">
          No data yet. It fills in as pull requests are reviewed.
        </p>
      </div>
    );
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  return (
    <div aria-label={ariaLabel}>
      <ChartContainer
        config={{ value: { label, color: color ?? "var(--chart-1)" } }}
        className="w-full"
        style={{ height: Math.max(160, rows.length * 40) }}
      >
        <BarChart accessibilityLayer layout="vertical" data={ranked}>
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={format}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => (
                  <span>
                    {format(Number(value))}
                    {item.payload.note ? ` · ${item.payload.note}` : ""}
                  </span>
                )}
              />
            }
          />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={0}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
