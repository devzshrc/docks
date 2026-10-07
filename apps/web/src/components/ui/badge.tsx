import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Neutral by default; colour only carries state.
        default: "border-info-border bg-info-bg text-info-text",
        secondary: "border-neutral-border bg-neutral-bg text-neutral-text",
        neutral: "border-neutral-border bg-neutral-bg text-neutral-text",
        destructive: "border-danger-border bg-danger-bg text-danger-text",
        success: "border-success-border bg-success-bg text-success-text",
        warning: "border-warning-border bg-warning-bg text-warning-text",
        info: "border-info-border bg-info-bg text-info-text",
        violet: "border-violet-border bg-violet-bg text-violet-text",
        outline: "border-border-control bg-transparent text-muted-foreground [a&]:hover:bg-hover [a&]:hover:text-foreground",
        ghost: "border-transparent bg-transparent text-muted-foreground [a&]:hover:bg-hover",
        link: "border-transparent text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

function Badge({
  className,
  variant = "secondary",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
