"use client";
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
}: {
  rows: RankedRow[];
  label: string;
  ariaLabel: string;
  format?: (v: number) => string;
  color?: string;
}) {
  if (!rows.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No data yet
      </p>
    );
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  return (
    <div aria-label={ariaLabel}>
      <ChartContainer
        config={{ value: { label, color: "var(--chart-1)" } }}
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
            radius={4}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
