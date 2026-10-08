"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Select, SelectItem } from "@/components/base/select/select"

import { Button } from "@/components/ui/button"
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

const ALL = "__all__"

/** "Label | Value ▾" filter pill on ReUI's dropdown menu. An empty string value ("any") is mapped to a sentinel because radio items need a value. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <Select aria-label={label} size="sm" selectedKey={value || ALL} onSelectionChange={(key) => onChange(key === ALL ? "" : String(key))} className={className} renderValue={({ selectedText }) => <span className="flex items-center gap-2"><span className="text-text-secondary">{label}</span><span className="text-text-primary">{selectedText}</span></span>}>
      {options.map((option) => <SelectItem key={option.value || ALL} id={option.value || ALL} textValue={option.label}>{option.label}</SelectItem>)}
    </Select>
  )
}

/** Toggle chip: quiet outline when off, brand-tinted when on. */
export function ToggleChip({ on, label, onChange, count }: { on: boolean; label: string; onChange: (v: boolean) => void; count?: number }) {
  return (
    <Button
      variant={on ? "ghost" : "outline"}
      size="sm"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn("h-8 rounded-full px-3 font-medium", on && "bg-primary/15 text-primary-text hover:bg-primary/20 hover:text-primary-text")}
    >
      {label}
      {count !== undefined && <span className={cn("tabular-nums", on ? "text-primary-text/80" : "text-text-3")}>{count}</span>}
    </Button>
  )
}
