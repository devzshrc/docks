"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SplitShowcaseItem {
  id?: string;
  title?: React.ReactNode;
  tag?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export interface SplitShowcaseProps {
  items?: [SplitShowcaseItem, SplitShowcaseItem] | SplitShowcaseItem[];
  className?: string;
  children?: React.ReactNode;
  compact?: boolean;
}

export function SplitShowcase({
  items = [],
  className,
  children,
  compact = false,
}: SplitShowcaseProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  const activeIndex = hoveredIndex ?? focusedIndex;
  const isAnyActive = activeIndex !== null;

  if (children) {
    return (
      <div className={cn("relative w-full max-w-5xl mx-auto", className)}>
        {children}
      </div>
    );
  }

  const [leftItem, rightItem] = items;

  const getSpringProps = (index: number) => {
    const isActive = activeIndex === index;
    const shift = index === 0 ? -12 : 12;

    if (reduceMotion) {
      return {};
    }

    return {
      animate: {
        x: isActive ? shift : 0,
        scale: isActive ? 0.98 : 1,
      },
      transition: {
        type: "spring" as const,
        stiffness: 350,
        damping: 24,
      },
    };
  };

  const renderCardContent = (item: SplitShowcaseItem) => (
    <>
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "gap-2" : "gap-3"
        )}
      >
        {item.icon && <div className="shrink-0">{item.icon}</div>}
        {item.title}
        {item.description && (
          <p
            className={cn(
              "text-muted-foreground",
              compact ? "max-w-xs text-xs" : "max-w-xs text-sm"
            )}
          >
            {item.description}
          </p>
        )}
      </div>
      {item.tag && (
        <span
          className={cn(
            "relative font-semibold uppercase text-muted-foreground",
            compact
              ? "top-0 text-[10px] tracking-wider"
              : "top-2 text-xs tracking-widest"
          )}
        >
          {item.tag}
        </span>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "relative grid w-full grid-cols-1 sm:grid-cols-2 gap-0 overflow-visible",
        className
      )}
    >
      {/* Card 1 (Left / Top) */}
      <div className="relative min-w-0">
        <motion.div
          {...getSpringProps(0)}
          className={cn(
            "flex h-full flex-col items-center justify-center text-foreground no-underline select-none",
            compact
              ? "min-h-[7.5rem] gap-3 p-4 sm:p-5"
              : "min-h-[11rem] gap-6 p-6 sm:p-8",
            "bg-card",
            "transition-[border-radius,box-shadow,border-color] duration-300",
            activeIndex === 0
              ? "rounded-[32px] sm:rounded-[32px] shadow-2xl shadow-black/10 dark:shadow-black/40 border border-border z-10"
              : "border border-border/40 sm:border-r-0 border-b-0 sm:border-b rounded-t-[32px] rounded-b-none sm:rounded-l-[32px] sm:rounded-r-none",
            leftItem?.className
          )}
          onMouseEnter={() => setHoveredIndex(0)}
          onMouseLeave={() => setHoveredIndex(null)}
          onFocus={() => setFocusedIndex(0)}
          onBlur={() => setFocusedIndex(null)}
        >
          {leftItem?.href ? (
            <a
              href={leftItem.href}
              target={leftItem.target ?? "_blank"}
              rel={leftItem.rel ?? "noreferrer"}
              aria-label={leftItem.ariaLabel}
              className="flex h-full w-full flex-col items-center justify-center gap-4 focus-visible:outline-none"
              onClick={leftItem.onClick}
            >
              {renderCardContent(leftItem)}
            </a>
          ) : (
            renderCardContent(leftItem)
          )}
        </motion.div>
      </div>

      {/* Dotted Divider - Desktop */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 z-10 hidden w-0 -translate-x-1/2 border-l-2 border-dotted border-border-control sm:block transition-opacity duration-250 ease-out",
          compact ? "inset-y-4" : "inset-y-8",
          isAnyActive ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Dotted Divider - Mobile */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 z-10 block h-0 -translate-y-1/2 border-t-2 border-dotted border-border-control sm:hidden transition-opacity duration-250 ease-out",
          compact ? "inset-x-4" : "inset-x-8",
          isAnyActive ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Card 2 (Right / Bottom) */}
      <div className="relative min-w-0">
        <motion.div
          {...getSpringProps(1)}
          className={cn(
            "flex h-full flex-col items-center justify-center text-foreground no-underline select-none",
            compact
              ? "min-h-[7.5rem] gap-3 p-4 sm:p-5"
              : "min-h-[11rem] gap-6 p-6 sm:p-8",
            "bg-card",
            "transition-[border-radius,box-shadow,border-color] duration-300",
            activeIndex === 1
              ? "rounded-[32px] sm:rounded-[32px] shadow-2xl shadow-black/10 dark:shadow-black/40 border border-border z-10"
              : "border border-border/40 sm:border-l-0 border-t-0 sm:border-t rounded-b-[32px] rounded-t-none sm:rounded-r-[32px] sm:rounded-l-none",
            rightItem?.className
          )}
          onMouseEnter={() => setHoveredIndex(1)}
          onMouseLeave={() => setHoveredIndex(null)}
          onFocus={() => setFocusedIndex(1)}
          onBlur={() => setFocusedIndex(null)}
        >
          {rightItem?.href ? (
            <a
              href={rightItem.href}
              target={rightItem.target ?? "_blank"}
              rel={rightItem.rel ?? "noreferrer"}
              aria-label={rightItem.ariaLabel}
              className="flex h-full w-full flex-col items-center justify-center gap-4 focus-visible:outline-none"
              onClick={rightItem.onClick}
            >
              {renderCardContent(rightItem)}
            </a>
          ) : (
            renderCardContent(rightItem)
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default SplitShowcase;
