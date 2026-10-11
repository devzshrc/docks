"use client";

import type { ComponentProps } from "react";
import * as AlignInput from "@/components/alignui/input";
import { cx } from "@/utils/cx";

function Input({ className, type, size, ...props }: ComponentProps<"input">) {
  const invalid = props["aria-invalid"];
  return (
    <AlignInput.Input
      type={type}
      htmlSize={size}
      hasError={invalid === true || invalid === "true"}
      data-slot="input"
      className={cx(
        // Preserve native sizing, refs, and flex layout for existing forms.
        "min-w-0 rounded-10 border border-stroke-soft-200 bg-bg-white-0 px-3 text-base shadow-regular-xs md:text-body-2-regular",
        "focus-visible:border-primary-base focus-visible:shadow-button-important-focus disabled:cursor-not-allowed disabled:bg-bg-weak-50",
        "aria-invalid:border-error-base aria-invalid:focus-visible:shadow-button-error-focus",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
