"use client";
import type { ComponentProps, ChangeEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
export function NativeCheckbox({
  checked,
  onChange,
  disabled,
  className,
  id,
  name,
  "aria-label": label,
  "aria-describedby": description,
}: ComponentProps<"input">) {
  return (
    <Checkbox
      id={id}
      name={name}
      checked={Boolean(checked)}
      onCheckedChange={(v) =>
        onChange?.({
          target: { checked: v === true },
          currentTarget: { checked: v === true },
        } as ChangeEvent<HTMLInputElement>)
      }
      disabled={disabled}
      className={className}
      aria-label={label}
      aria-describedby={description}
    />
  );
}
