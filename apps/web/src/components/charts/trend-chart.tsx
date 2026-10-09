"use client";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
export type TrendRow = { label: string; value: number | null };
export function TrendChart({
  rows,
  label,
  ariaLabel,
  format = (v) => String(v),
  height = 200,
}: {
  rows: TrendRow[];
  label: string;
  ariaLabel: string;
  format?: (v: number) => string;
  color?: string;
  height?: number;
}) {
  if (!rows.some((row) => row.value !== null))
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No data yet
      </p>
    );
  return (
    <div aria-label={ariaLabel}>
      <ChartContainer
        config={{ value: { label, color: "var(--chart-1)" } }}
        className="w-full"
        style={{ height }}
      >
        <LineChart
          accessibilityLayer
          data={rows}
          margin={{ left: 0, right: 12 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={format}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => format(Number(value))}
              />
            }
          />
          <Line
            dataKey="value"
            type="linear"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
