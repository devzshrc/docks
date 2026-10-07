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

  return (
    <span className={cn("inline-flex flex-wrap", className)} aria-label={children} role="text">
      {children.split("").map((char, index) => (
        <motion.span
          key={index}
          aria-hidden
          className="inline-block"
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          animate={reduceMotion ? undefined : { rotateX: hoveredIndex === index ? 360 : 0, y: hoveredIndex === index ? -4 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </span>
  );
}

export default FlipText;
