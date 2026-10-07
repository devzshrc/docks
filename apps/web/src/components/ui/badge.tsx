import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Neutral by default; colour only carries state.
        default: "bg-info-bg text-info-text",
        secondary: "bg-neutral-bg text-neutral-text",
        neutral: "bg-neutral-bg text-neutral-text",
        destructive: "bg-danger-bg text-danger-text",
        success: "bg-success-bg text-success-text",
        warning: "bg-warning-bg text-warning-text",
        info: "bg-info-bg text-info-text",
        violet: "bg-violet-bg text-violet-text",
        outline: "bg-muted text-muted-foreground [a&]:hover:bg-hover [a&]:hover:text-foreground",
        ghost: "bg-transparent text-muted-foreground [a&]:hover:bg-hover",
        link: "text-primary-text underline-offset-4 [a&]:hover:underline",
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
