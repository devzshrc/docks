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

/** A row of equal-width figures, each on its own panel inside one frame. */
export function StatStrip({ stats }: { stats: { label: string; value: string; sub?: string }[] }) {
  return (
    <Frame className="stagger grid grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <FramePanel key={s.label} className="min-w-0 space-y-1.5 p-5">
          <p className="text-muted-foreground text-xs">{s.label}</p>
          <p className="text-2xl font-medium tracking-tight tabular-nums">{s.value}</p>
          <p className="text-text-3 min-h-4 text-xs">{s.sub ?? " "}</p>
        </FramePanel>
      ))}
    </Frame>
  )
}
