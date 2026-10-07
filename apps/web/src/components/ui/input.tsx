import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md bg-(--field) px-3 py-1 text-sm transition-[color,box-shadow,background-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-text-3 hover:bg-(--field-hover) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:bg-(--field) focus-visible:ring-2 focus-visible:ring-primary/60",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
