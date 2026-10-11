import type { ComponentType } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cx } from "@/utils/cx";

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
    <div className={cx("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {stats.map(({ icon: Icon, ...stat }) => (
        <Card key={stat.label}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-body-2-regular text-text-secondary">
              {stat.label}
            </CardTitle>
            <Icon aria-hidden className="size-5 text-text-tertiary" />
          </CardHeader>
          <CardContent>
            <p className="text-display-4-medium text-text-primary tabular-nums">
              {stat.value}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {stat.delta && (
                <Badge
                  variant={
                    stat.deltaColor === "lime"
                      ? "green"
                      : stat.deltaColor === "rose"
                        ? "red"
                        : "secondary"
                  }
                >
                  {stat.delta}
                </Badge>
              )}
              <p className="text-caption-1-regular text-text-secondary">
                {stat.description ?? stat.caption}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
