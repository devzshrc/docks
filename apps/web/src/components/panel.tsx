import { cn } from "@/lib/utils"

/** Bordered surface with a header row (title, optional meta and actions). The one container for dashboard sections. */
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
    <section className={cn("bg-card border-hairline min-w-0 rounded-xl border", className)}>
      {(title || actions) && (
        <header className="border-hairline flex min-h-12 items-center justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-medium tracking-tight">{title}</h2>}
            {description && <p className="text-muted-foreground text-xs">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  )
}

/** A row of equal-width figures in one panel, separated by hairlines. */
export function StatStrip({ stats }: { stats: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="bg-card border-hairline grid grid-cols-2 overflow-hidden rounded-xl border lg:grid-cols-4">
      {stats.map((s, i) => (
        <div key={s.label} className={cn("border-hairline min-w-0 space-y-1 p-5", i % 2 === 1 && "border-l", i >= 2 && "border-t lg:border-t-0", i > 0 && "lg:border-l")}>
          <p className="text-muted-foreground text-xs">{s.label}</p>
          <p className="text-2xl font-medium tracking-tight tabular-nums">{s.value}</p>
          <p className="text-text-3 min-h-4 text-xs">{s.sub ?? " "}</p>
        </div>
      ))}
    </div>
  )
}
