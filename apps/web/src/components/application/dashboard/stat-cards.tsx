import type { ComponentType } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HueIcon, type Hue } from "@/components/ui/empty-preview";

const TONE_HUE: Record<StatTone, Hue> = { blue: "blue", orange: "orange", purple: "purple", pink: "pink", sky: "teal", emerald: "green" };
const CYCLE: Hue[] = ["indigo", "teal", "amber", "green"];
export type StatTone =
  "blue" | "orange" | "purple" | "pink" | "sky" | "emerald";
export type Stat = {
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  label: string;
  value: string;
  description?: string;
  delta?: string;
  deltaColor: "lime" | "rose" | "neutral";
  tone?: StatTone;
  caption?: string;
  hint?: string;
};
export function StatCards({
  stats = [],
  className,
}: {
  stats?: Stat[];
  variant?: "plain" | "footer";
  className?: string;
}) {
  return (
    <div
      className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${className ?? ""}`}
    >
      {stats.map(({ icon: Icon, ...stat }, i) => (
        <Card key={stat.label}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-muted-foreground text-[13px] font-normal">{stat.label}</CardTitle>
            <HueIcon icon={Icon} hue={stat.tone ? TONE_HUE[stat.tone] : CYCLE[i % CYCLE.length]!} className="size-6 rounded-md [&_svg]:size-3" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">{stat.value}</p>
            <div className="mt-2 flex items-center gap-2">
              {stat.delta && <Badge variant={stat.deltaColor === "lime" ? "green" : stat.deltaColor === "rose" ? "red" : "secondary"}>{stat.delta}</Badge>}
              <p className="text-xs text-muted-foreground">
                {stat.description ?? stat.caption}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
