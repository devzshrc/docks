"use client";

import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import * as AlignButton from "@/components/alignui/button";
import { cx } from "@/utils/cx";

// Keep existing callers stable while using the open-source AlignUI button.
const buttonVariants = cva(
  "shrink-0 cursor-pointer select-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "",
        destructive: "",
        outline: "",
        secondary: "",
        ghost: "",
        row: "h-auto justify-start rounded-lg text-start text-body-2-regular whitespace-normal",
        link: "rounded-none underline underline-offset-4",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-7 gap-1 px-2 text-caption-1-medium",
        sm: "h-8 gap-1.5 px-3",
        lg: "h-11 px-5",
        icon: "size-9 p-0",
        "icon-xs": "size-7 p-0",
        "icon-sm": "size-8 p-0",
        "icon-lg": "size-11 p-0",
        none: "h-auto p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  pending = false,
  disabled,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    pending?: boolean;
  }) {
  const tone =
    variant === "default"
      ? "primary"
      : variant === "destructive"
        ? "error"
        : "neutral";
  const mode =
    variant === "outline"
      ? "stroke"
      : variant === "secondary"
        ? "lighter"
        : ["ghost", "row", "link"].includes(variant ?? "")
          ? "ghost"
          : "filled";
  return (
    <AlignButton.Root
      variant={tone}
      mode={mode}
      size="small"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cx(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
