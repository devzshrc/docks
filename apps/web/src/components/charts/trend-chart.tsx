"use client";
import { RiArrowDownLine, RiArrowUpLine } from "@remixicon/react";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartGhost } from "@/components/ui/empty-preview";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { type Polarity, type Tone, weekInsight } from "@/lib/trend-insight";

/** "2026-09-28" → "Sep 28" for weekly x-axis labels. */
export const weekLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export type TrendRow = { label: string; value: number | null };

const TONE_TEXT: Record<Tone, string> = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-muted-foreground",
};
const TONE_CHIP: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  bad: "bg-danger/10 text-danger",
  neutral: "bg-muted text-muted-foreground",
};

/** Hover card: the value, its change from last week, and the one takeaway for that week. */
function InsightTooltip({
  rows,
  active,
  label,
  metric,
  polarity,
  format,
}: {
  rows: TrendRow[];
  active?: boolean;
  label?: string;
  metric: string;
  polarity: Polarity;
  format: (v: number) => string;
}) {
  const index = rows.findIndex((r) => r.label === label);
  if (!active || index < 0) return null;
  const row = rows[index]!;
  const insight = weekInsight(
    rows.map((r) => r.value),
    index,
    { polarity, format },
  );
  const DeltaIcon = (insight.delta ?? 0) >= 0 ? RiArrowUpLine : RiArrowDownLine;
  const share = row.value !== null && insight.average > 0 ? Math.min(1, row.value / (insight.average * 2)) : 0;
  return (
    <div className="animate-in fade-in zoom-in-[0.97] w-56 rounded-xl bg-popover p-3 text-xs shadow-overlay duration-150">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>Week of {row.label}</span>
        {insight.delta !== null && insight.delta !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums", TONE_CHIP[insight.deltaTone])}>
            <DeltaIcon className="size-3" aria-hidden />
            {format(Math.abs(insight.delta))}
          </span>
        )}
      </div>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tracking-[-0.02em] text-foreground tabular-nums">
          {row.value === null ? "—" : format(row.value)}
        </span>
        <span className="text-muted-foreground">{metric.toLowerCase()}</span>
      </p>
      <p className={cn("mt-1 font-medium", TONE_TEXT[insight.headlineTone])}>{insight.headline}</p>
      {row.value !== null && insight.average > 0 && (
        <div className="mt-2.5 grid gap-1">
          <div className="relative h-1 rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-value)] transition-[width] duration-200" style={{ width: `${share * 100}%` }} />
            <div className="absolute -top-0.5 left-1/2 h-2 w-px bg-foreground/40" aria-hidden />
          </div>
          <span className="text-[11px] text-subtle">Marker is the average, {format(Math.round(insight.average * 10) / 10)}</span>
        </div>
      )}
    </div>
  );
}

export function TrendChart({
  rows,
  label,
  ariaLabel,
  format = (v) => String(v),
  color,
  height = 200,
  polarity = "higher",
}: {
  rows: TrendRow[];
  label: string;
  ariaLabel: string;
  format?: (v: number) => string;
  color?: string;
  height?: number;
  /** Which direction is good news; colours the hover takeaway. */
  polarity?: Polarity;
}) {
  const fillId = `trend-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!rows.some((row) => row.value !== null))
    return (
      <div className="relative py-4" role="img" aria-label={`${ariaLabel}: no data yet`}>
        <ChartGhost />
        <p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-[13px]">
          No data yet. It fills in as pull requests are reviewed.
        </p>
      </div>
    );
  // Headroom above the peak so the line and its hover dot are never clipped,
  // rounded to a whole step so gridlines land on clean values.
  const known = rows.flatMap((r) => (r.value === null ? [] : [r.value]));
  const max = Math.max(0, ...known);
  const average = known.reduce((a, b) => a + b, 0) / known.length;
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = Math.max(step * 2, Math.ceil((max * 1.15) / step) * step);
  const yTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // Every other week, counted back from the latest so the newest label always shows.
  const xTicks = rows.filter((_, i) => (rows.length - 1 - i) % 2 === 0).map((r) => r.label);
  return (
    <div role="img" aria-label={ariaLabel} className="trend-reveal">
      <ChartContainer
        config={{ value: { label, color: color ?? "var(--chart-1)" } }}
        className="w-full"
        style={{ height }}
      >
        <AreaChart accessibilityLayer data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            ticks={xTicks}
            interval={0}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={[0, top]}
            ticks={yTicks}
            allowDecimals={false}
            tickFormatter={format}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            width={36}
          />
          <ReferenceLine
            y={average}
            stroke="var(--line-strong)"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{ value: "avg", position: "insideTopRight", fontSize: 10, fill: "var(--subtle)", dy: -2 }}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--color-value)", strokeOpacity: 0.35, strokeWidth: 1 }}
            wrapperStyle={{ transition: "transform 160ms cubic-bezier(0.25, 1, 0.5, 1)", outline: "none" }}
            content={<InsightTooltip rows={rows} metric={label} polarity={polarity} format={format} />}
          />
          <Area
            dataKey="value"
            type="monotoneX"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill={`url(#${fillId})`}
            dot={false}
            activeDot={{ r: 4.5, strokeWidth: 2.5, stroke: "var(--card)", className: "trend-active-dot" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
