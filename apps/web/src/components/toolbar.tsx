"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** One row of controls (search, filters, chips, then actions). Wraps on small screens; every control is 32px. */
export function Toolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}

export function ToolbarSearch({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("relative min-w-0 flex-1 md:w-60 md:flex-none", className)}>
      <HugeiconsIcon icon={Search01Icon} size={14} className="text-text-3 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
      <Input type="search" className="h-8 rounded-full pl-8 text-xs" {...props} />
    </div>
  )
}

/** "Label  Value ▾": a pill that wraps a native select, so it stays accessible and keyboard friendly. */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn("tex-neutral relative inline-flex h-8 items-center gap-1.5 rounded-full pr-7 pl-3 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <select className="select-bare" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 pointer-events-none absolute right-2.5" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  )
}

/** Toggle chip: neutral when off, tinted accent when on. */
export function ToggleChip({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "h-8 rounded-full px-3 text-xs font-medium transition-[color,background-color,box-shadow,transform] duration-150 active:scale-95",
        on
          ? "bg-primary/10 text-primary shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
          : "text-muted-foreground hover:bg-hover hover:text-foreground shadow-[0_0_0_1px_var(--hairline)]"
      )}
    >
      {label}
    </button>
  )
}
