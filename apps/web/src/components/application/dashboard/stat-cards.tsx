import type { ComponentType } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      {stats.map(({ icon: Icon, ...stat }) => (
        <Card key={stat.label}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
            <Icon className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
            <div className="mt-2 flex items-center gap-2">
              {stat.delta && <Badge variant="secondary">{stat.delta}</Badge>}
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
