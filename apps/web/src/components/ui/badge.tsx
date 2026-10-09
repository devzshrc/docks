import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 text-xs leading-none font-normal whitespace-nowrap transition-[color,background-color,border-color] duration-150 ease-power3-out focus-visible:ring-2 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary-hover",
        secondary:
          "border-(--tag-neutral-border) bg-(--tag-neutral-bg) text-(--tag-neutral-text) data-[tone=success]:border-(--tag-green-border) data-[tone=success]:bg-(--tag-green-bg) data-[tone=success]:text-(--tag-green-text) data-[tone=warning]:border-(--tag-amber-border) data-[tone=warning]:bg-(--tag-amber-bg) data-[tone=warning]:text-(--tag-amber-text) data-[tone=danger]:border-(--tag-red-border) data-[tone=danger]:bg-(--tag-red-bg) data-[tone=danger]:text-(--tag-red-text) data-[tone=info]:border-(--tag-blue-border) data-[tone=info]:bg-(--tag-blue-bg) data-[tone=info]:text-(--tag-blue-text) [a&]:hover:brightness-110",
        destructive:
          "border-(--tag-red-border) bg-(--tag-red-bg) text-(--tag-red-text)",
        outline:
          "border-line-strong bg-transparent text-foreground [a&]:hover:bg-accent",
        ghost: "border-transparent [a&]:hover:bg-accent",
        link: "border-transparent text-primary-text underline-offset-4 [a&]:hover:underline",
        blue: "border-(--tag-blue-border) bg-(--tag-blue-bg) text-(--tag-blue-text)",
        purple:
          "border-(--tag-purple-border) bg-(--tag-purple-bg) text-(--tag-purple-text)",
        green:
          "border-(--tag-green-border) bg-(--tag-green-bg) text-(--tag-green-text)",
        red: "border-(--tag-red-border) bg-(--tag-red-bg) text-(--tag-red-text)",
        orange:
          "border-(--tag-orange-border) bg-(--tag-orange-bg) text-(--tag-orange-text)",
        amber:
          "border-(--tag-amber-border) bg-(--tag-amber-bg) text-(--tag-amber-text)",
        teal: "border-(--tag-teal-border) bg-(--tag-teal-bg) text-(--tag-teal-text)",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

function Badge({
  className,
  variant = "secondary",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
