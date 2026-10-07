"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface FlipTextProps {
  children: string;
  className?: string;
}

/**
 * Each character flips on hover (ObsidianUI Flip Text, hover version from the docs: the registry's looping
 * version depends on a stylesheet that isn't shipped). Text stays one accessible string; motion is skipped
 * for people who prefer reduced motion.
 */
export function FlipText({ children, className }: FlipTextProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  // Characters are grouped by word so a long line only ever wraps between words.
  let offset = 0;
  const words = children.split(" ").map((word) => {
    const start = offset;
    offset += word.length + 1;
    return { word, start };
  });

  return (
    <span className={cn("inline-flex flex-wrap gap-x-[0.28em]", className)}>
      <span className="sr-only">{children}</span>
      {words.map(({ word, start }) => (
        <span key={start} className="inline-flex whitespace-nowrap" aria-hidden>
          {word.split("").map((char, i) => {
            const index = start + i;
            return (
              <motion.span
                key={index}
                className="inline-block"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                animate={reduceMotion ? undefined : { rotateX: hoveredIndex === index ? 360 : 0, y: hoveredIndex === index ? -4 : 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {char}
              </motion.span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

export default FlipText;
