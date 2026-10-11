"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  Select as CoreSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** One row of controls (search, filters, chips, then actions). Wraps on small screens; every control is 32px. */
export function Toolbar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function ToolbarSearch({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <div
      className={cn("relative min-w-0 flex-1 md:w-60 md:flex-none", className)}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        size={14}
        className="text-text-3 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        className="h-[30px] rounded-full border-0 pl-8 text-xs shadow-control"
        {...props}
      />
    </div>
  );
}

const ALL = "__all__";

/** "Label | Value ▾" filter pill, as in the CRM reference. An empty string value ("any") maps to a sentinel because select items need a value. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <CoreSelect
      value={value || ALL}
      onValueChange={(key) => onChange(key === ALL ? "" : key)}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn(
          "h-[30px] gap-0 py-0 pr-2.5 pl-0 text-xs data-[size=sm]:h-[30px]",
          className,
        )}
      >
        <span className="text-subtle border-line-strong flex h-full items-center border-r pr-2 pl-3">
          {label}
        </span>
        <span className="flex items-center pr-1.5 pl-2 font-medium">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="min-w-40">
        {options.map((option) => (
          <SelectItem key={option.value || ALL} value={option.value || ALL}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </CoreSelect>
  );
}

/** Toggle chip: quiet outline when off, brand-tinted when on. */
export function ToggleChip({
  on,
  label,
  onChange,
  count,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
  count?: number;
}) {
  return (
    <Button
      variant={on ? "secondary" : "outline"}
      size="sm"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "font-medium",
        !on && "text-muted-foreground font-normal",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums",
            on ? "text-soft" : "text-subtle",
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}
