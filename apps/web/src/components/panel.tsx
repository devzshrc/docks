"use client";

import { StatCards } from "@/components/application/dashboard/stat-cards";
import {
  RiGitPullRequestLine,
  RiTimeLine,
  RiCheckboxCircleLine,
  RiBarChartLine,
} from "@remixicon/react";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui-compat/frame";
import { cx as cn } from "@/utils/cx";

/** Shared section container with a clear heading, optional actions, and a bordered body. */
export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Frame className={cn("min-w-0", className)}>
      {(title || actions) && (
        <FrameHeader className="min-h-12 flex-row flex-wrap items-start justify-between gap-3 border-b border-separator-border pb-4">
          <div className="min-w-0">
            {title && (
              <FrameTitle className="text-body-medium text-text-primary">
                {title}
              </FrameTitle>
            )}
            {description && (
              <FrameDescription className="mt-1 text-body-2-regular">
                {description}
              </FrameDescription>
            )}
          </div>
          {actions}
        </FrameHeader>
      )}
      <FramePanel className={cn("p-5", bodyClassName)}>{children}</FramePanel>
    </Frame>
  );
}

/** shadcn metric cards using real workspace figures. */
export function StatStrip({
  stats,
}: {
  stats: { label: string; value: string; sub?: string }[];
}) {
  const icons = [
    RiGitPullRequestLine,
    RiTimeLine,
    RiCheckboxCircleLine,
    RiBarChartLine,
  ];
  return (
    <StatCards
      stats={stats.map((stat, i) => ({
        icon: icons[i % icons.length]!,
        label: stat.label,
        value: stat.value,
        description: stat.sub,
        deltaColor: "neutral",
      }))}
    />
  );
}
