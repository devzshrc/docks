import * as React from "react"
import { dashboardButtonVariants } from "@/components/obsidian/dashboard-shell"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

type Variant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const VARIANTS: Record<Variant, { obsidian: "primary" | "secondary" | "ghost" | "muted"; extra?: string }> = {
  default: { obsidian: "primary" },
  secondary: { obsidian: "secondary" },
  outline: { obsidian: "secondary" },
  ghost: { obsidian: "ghost" },
  destructive: {
    obsidian: "primary",
    extra: "bg-destructive text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-destructive hover:brightness-105 focus-visible:ring-destructive/40",
  },
  link: { obsidian: "ghost", extra: "btn-plain h-auto rounded-none p-0 text-primary-text underline-offset-4 hover:bg-transparent hover:text-primary-text hover:underline" },
}

const SIZES: Record<Size, string> = {
  default: "h-8 px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4",
  xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-10 px-5 text-sm [&_svg:not([class*='size-'])]:size-4",
  icon: "size-8 p-0 [&_svg:not([class*='size-'])]:size-4",
  "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
  "icon-sm": "size-7 p-0 [&_svg:not([class*='size-'])]:size-4",
  "icon-lg": "size-10 p-0 [&_svg:not([class*='size-'])]:size-5",
}

/** ObsidianUI's own button recipe, with this app's sizes and a destructive/link variant on top. */
function buttonVariants({ variant = "default", size = "default", className }: { variant?: Variant | null; size?: Size | null; className?: string } = {}) {
  const v = VARIANTS[variant ?? "default"]
  return cn(dashboardButtonVariants({ variant: v.obsidian }), SIZES[size ?? "default"], v.extra, "aria-invalid:ring-destructive/40", className)
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> & {
    variant?: Variant | null
    size?: Size | null
    asChild?: boolean
    /** Shows a spinner over the label without changing the button's width. */
    pending?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }), pending && "relative")}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {asChild || !pending ? (
        children
      ) : (
        <>
          <span className="invisible inline-flex items-center gap-[inherit]">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <svg viewBox="0 0 24 24" className="anim-spin size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 3a9 9 0 1 0 9 9" opacity={0.9} />
            </svg>
          </span>
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
