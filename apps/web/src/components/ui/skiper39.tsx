"use client";

import { type ReactNode } from "react";

import { cx } from "@/utils/cx";

export function Skiper39({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-black text-white",
        className,
      )}
    >
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-5 pt-16 pb-16 text-center md:px-8 md:pt-20">
        {children ?? (
          <p className="text-headline-medium text-text-tertiary">
            A little less waiting. A lot more building.
          </p>
        )}
      </div>
    </div>
  );
}

export default Skiper39;
