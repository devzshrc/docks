import * as React from "react";
import { Slot } from "radix-ui";
import {
  Button as BoardButton,
  buttonStyles,
} from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

type Variant =
  "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type Size =
  "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
const variants = {
  default: "primary",
  outline: "secondary",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "danger",
  link: "ghost",
} as const;
const sizes = {
  default: "medium",
  xs: "xs",
  sm: "small",
  lg: "medium",
  icon: "medium",
  "icon-xs": "xs",
  "icon-sm": "small",
  "icon-lg": "medium",
} as const;
export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: { variant?: Variant | null; size?: Size | null; className?: string } = {}) {
  const v = variant ?? "default",
    s = size ?? "default";
  return cx(
    buttonStyles.base,
    buttonStyles.variant[variants[v]],
    buttonStyles.size[sizes[s]],
    s.startsWith("icon") && "size-9 p-0",
    v === "link" && "bg-transparent p-0 underline-offset-4 hover:underline",
    className,
  );
}
export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  children,
  disabled,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  pending?: boolean;
}) {
  const shared = {
    ...props,
    "data-slot": "button",
    "data-variant": variant,
    "data-size": size,
    "aria-busy": pending || undefined,
  };
  const classes = cx(
    "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>span]:gap-1.5",
    pending && "relative",
    size.startsWith("icon") && "size-9 p-0",
    variant === "link" &&
      "bg-transparent p-0 underline-offset-4 hover:underline",
    className,
  );
  if (asChild)
    return (
      <Slot.Root
        {...shared}
        className={buttonVariants({ variant, size, className: classes })}
        aria-disabled={disabled || pending || undefined}
      >
        {children}
      </Slot.Root>
    );
  return (
    <BoardButton
      {...shared}
      type={type}
      variant={variants[variant]}
      size={sizes[size]}
      disabled={disabled || pending}
      className={classes}
    >
      {pending ? (
        <>
          <span className="invisible inline-flex items-center gap-1.5">
            {children}
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              className="anim-spin size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          </span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5">{children}</span>
      )}
    </BoardButton>
  );
}
