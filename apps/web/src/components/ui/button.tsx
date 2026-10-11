import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium leading-none whitespace-nowrap outline-none select-none transition-[background-color,background-image,color,box-shadow,transform,opacity] duration-150 ease-power3-out active:scale-[0.97] active:duration-75 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "glass-sheen bg-primary text-primary-foreground shadow-primary [text-shadow:0_1px_0_rgb(0_0_0/0.12)] hover:bg-primary-hover active:shadow-[0_0_0_1px_#1d63d6,inset_0_1px_3px_0_rgb(0_0_0/0.18)]",
        destructive:
          "glass-sheen bg-destructive text-white shadow-[0_0_0_1px_#b91c1c,0_1px_2px_0_rgb(127_29_29/0.25),inset_0_1px_0_0_rgb(255_255_255/0.25)] hover:bg-destructive/90",
        outline:
          "glass-surface bg-secondary text-secondary-foreground shadow-control active:shadow-control-active dark:bg-none dark:hover:bg-muted",
        secondary:
          "glass-surface bg-muted text-foreground shadow-control active:shadow-control-active dark:bg-none dark:hover:bg-[#333333]",
        ghost:
          "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]",
        row: "h-auto justify-start rounded-lg text-left leading-normal font-normal whitespace-normal text-foreground hover:bg-foreground/[0.05] active:scale-100 dark:hover:bg-white/[0.05]",
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
        none: "",
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
