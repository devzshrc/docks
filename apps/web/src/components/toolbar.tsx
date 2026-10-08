"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  const current = options.find((o) => o.value === value)?.label ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${label}: ${current}`} className={cn("group h-8 gap-0 overflow-hidden px-0 shadow-xs", className)}>
          <span className="text-muted-foreground px-2.5 font-normal">{label}</span>
          <span aria-hidden className="bg-border h-full w-px" />
          <span className="flex items-center gap-1.5 px-2.5">
            {current}
            <ChevronDownIcon aria-hidden className="text-muted-foreground size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value === "" ? ALL : value} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value === "" ? ALL : o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Toggle chip: quiet outline when off, brand-tinted when on. */
export function ToggleChip({ on, label, onChange, count }: { on: boolean; label: string; onChange: (v: boolean) => void; count?: number }) {
  return (
    <Button
      variant="ghost"
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
