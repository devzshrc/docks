import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Chip } from "@/components/base/badges/chip"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        neutral: "bg-neutral-bg text-neutral-text",
        success: "bg-status-lime-background text-status-lime-text",
        warning: "bg-status-yellow-background text-status-yellow-text",
        info: "bg-status-cyan-background text-status-cyan-text",
        violet: "bg-status-purple-background text-status-purple-text",
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
  const classes = cn(badgeVariants({ variant }), className)
  if (asChild) return <Slot.Root data-slot="badge" data-variant={variant} className={classes} {...props} />
  const color = variant === "success" ? "lime" : variant === "warning" ? "yellow" : variant === "destructive" ? "rose" : variant === "info" ? "cyan" : variant === "violet" ? "purple" : "neutral"
  return <Chip {...props} color={color} variant="caption" data-slot="badge" data-variant={variant} className={classes} />

}

export { Badge, badgeVariants }
