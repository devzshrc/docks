import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium leading-none whitespace-nowrap outline-none select-none transition-[background-color,color,box-shadow,transform] duration-150 ease-power3-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover",
        destructive:
          "bg-destructive text-white shadow-control hover:bg-destructive/90",
        outline:
          "bg-secondary text-secondary-foreground shadow-control hover:bg-accent dark:hover:bg-muted",
        secondary:
          "bg-muted text-foreground shadow-control hover:bg-accent dark:hover:bg-[#333333]",
        ghost:
          "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]",
        link: "rounded-none text-foreground underline decoration-from-font underline-offset-2 hover:text-soft active:scale-100",
      },
      size: {
        default: "h-8 px-3.5 text-[13px] has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-10 px-5 text-sm has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    pending?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
