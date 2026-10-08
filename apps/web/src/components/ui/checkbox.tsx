"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckboxGlyph } from "@/components/base/checkbox/checkbox-glyph"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const [local, setLocal] = React.useState(props.defaultChecked ?? false)
  const checked = props.checked ?? local
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
      onCheckedChange={(value) => { setLocal(value); props.onCheckedChange?.(value) }}
    >
      <CheckboxGlyph state={{ isSelected: checked === true, isIndeterminate: checked === "indeterminate", isDisabled: !!props.disabled, isFocusVisible: false, isHovered: false }} />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
