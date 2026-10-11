"use client";

import { RiSearchLine } from "@remixicon/react";

import {
  Select as CoreSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cx as cn } from "@/utils/cx";

/** One row of controls (search, filters, chips, then actions). Wraps on small screens; controls share a 36px height. */
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
      <RiSearchLine
        className="text-text-tertiary pointer-events-none absolute top-1/2 start-3 z-10 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        className="h-9 ps-6 text-body-2-regular"
        {...props}
      />
    </div>
  );
}

const ALL = "__all__";

/** "Label | Value ▾" filter control. An empty string value ("any") maps to a sentinel because select items need a value. */
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
          "h-9 gap-1 py-0 pe-3 ps-3 text-body-2-regular data-[size=sm]:h-9",
          className,
        )}
      >
        <span className="text-text-secondary flex h-full items-center pe-1">
          {label}
        </span>
        <span className="flex min-w-0 items-center text-text-primary">
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
        "h-9 text-body-2-medium",
        on &&
          "bg-primary-alpha-10 text-primary-base ring-1 ring-inset ring-primary/15",
        !on && "text-muted-foreground font-normal",
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("tabular-nums", on ? "text-soft" : "text-subtle")}>
          {count}
        </span>
      )}
    </Button>
  );
}
