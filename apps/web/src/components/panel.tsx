"use client";

import { StatCards } from "@/components/application/dashboard/stat-cards"
import { RiGitPullRequestLine, RiTimeLine, RiCheckboxCircleLine, RiBarChartLine } from "@remixicon/react"
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"
import { cn } from "@/lib/utils"

/** A ReUI frame: header bar (title, optional meta and actions) above an inset content panel. The one container for dashboard sections. */
export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <Frame className={cn("min-w-0", className)}>
      {(title || actions) && (
        <FrameHeader className="min-h-11 flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <FrameTitle className="font-medium tracking-tight">{title}</FrameTitle>}
            {description && <FrameDescription className="text-xs">{description}</FrameDescription>}
          </div>
          {actions}
        </FrameHeader>
      )}
      <FramePanel className={cn("p-5", bodyClassName)}>{children}</FramePanel>
    </Frame>
  )
}

/** BoardUI metric cards using real workspace figures. */
export function StatStrip({ stats }: { stats: { label: string; value: string; sub?: string }[] }) {
  const icons = [RiGitPullRequestLine, RiTimeLine, RiCheckboxCircleLine, RiBarChartLine]
  return <StatCards stats={stats.map((stat, i) => ({ icon: icons[i % icons.length]!, label: stat.label, value: stat.value, description: stat.sub, deltaColor: "neutral" }))} />
}
