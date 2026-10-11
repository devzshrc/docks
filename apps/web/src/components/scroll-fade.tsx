"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/utils/cx";

/** Keep the top edge of an internal scroll region soft as content moves. */
export function ScrollFade({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [opacity, setOpacity] = useState(0);
  return (
    <div className="relative min-w-0">
      <div
        className={cx("overflow-y-auto", className)}
        onScroll={(event) =>
          setOpacity(Math.min(event.currentTarget.scrollTop / 24, 1))
        }
      >
        {children}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0">
        <div
          className="absolute inset-x-0 top-0 h-6 backdrop-blur-[1px] [mask-image:linear-gradient(black,transparent)]"
          style={{ opacity }}
        />
        <div
          className="absolute inset-x-0 top-0 h-4 backdrop-blur-[4px] [mask-image:linear-gradient(black,transparent)]"
          style={{ opacity }}
        />
        <div
          className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background-primary-default to-transparent"
          style={{ opacity }}
        />
      </div>
    </div>
  );
}
