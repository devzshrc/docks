"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts its children once, when they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Two-tone display heading: a solid first line and a quieter second line. */
export function DisplayHeading({
  eyebrow,
  title,
  muted,
  className,
  align = "center",
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  muted?: ReactNode;
  className?: string;
  align?: "center" | "left";
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {eyebrow && (
        <p className="text-muted-foreground mb-4 text-[15px] tracking-[-0.01em]">
          {eyebrow}
        </p>
      )}
      <Tag className="text-[clamp(2.4rem,5.4vw,4.25rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
        <span className="block">{title}</span>
        {muted && (
          <span className="block bg-gradient-to-b from-[#9b9ba1] to-[#c4c4c9] bg-clip-text text-transparent">
            {muted}
          </span>
        )}
      </Tag>
    </div>
  );
}

/**
 * Drives a looping storyboard: returns the current step index (0..steps-1), advancing on the given
 * schedule while the element is on screen. Reduced motion pins it to the last step.
 */
export function useStoryboard(durations: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const t = setTimeout(
      () => setStep((s) => (s + 1) % durations.length),
      durations[step],
    );
    return () => clearTimeout(t);
  }, [step, inView, reduce, durations]);
  return { ref, step: reduce ? durations.length - 1 : step, reduce };
}
