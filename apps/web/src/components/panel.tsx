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
        <header className="border-hairline flex min-h-14 items-center justify-between gap-3 border-b px-5 py-3.5">
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

/** A row of equal-width figures, each on its own tile. */
export function StatStrip({ stats }: { stats: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-card border-hairline min-w-0 space-y-1.5 rounded-xl border p-5">
          <p className="text-muted-foreground text-xs">{s.label}</p>
          <p className="text-2xl font-medium tracking-tight tabular-nums">{s.value}</p>
          <p className="text-text-3 min-h-4 text-xs">{s.sub ?? " "}</p>
        </div>
      ))}
    </div>
  )
}
