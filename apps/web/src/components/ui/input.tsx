"use client";
import * as React from "react";
import { InputBase } from "@/components/base/input/input";
import { cx } from "@/utils/cx";
/** Native event API keeps existing forms and labels intact; BoardUI owns the field shell. */
export function Input({
  className,
  size: _size,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <InputBase
      {...props}
      size="medium"
      fieldClassName={cx("min-w-0", className)}
      className="board-input input-bare"
    />
  );
}
