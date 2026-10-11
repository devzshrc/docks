"use client";

// Adapted from Aceternity UI's ContainerScroll for Docks: a frosted light bezel instead of the dark
// device frame, blue-tinted depth, a 16:10 screen, and no tilt for people who prefer reduced motion.
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ContainerScroll({
  titleComponent,
  children,
  footer,
}: {
  titleComponent: ReactNode;
  children: ReactNode;
  /** Rendered under the screen, outside the tilt (e.g. a scene picker). */
  footer?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] });
  const reduce = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // The screen starts leaning back and levels out over the first half of the scroll.
  const rotate = useTransform(scrollYProgress, [0, 0.45], reduce ? [0, 0] : [20, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.45], reduce ? [1, 1] : isMobile ? [0.92, 1] : [1.04, 1]);
  const translate = useTransform(scrollYProgress, [0, 0.45], reduce ? [0, 0] : [0, -60]);

  return (
    <div ref={containerRef} className="relative flex flex-col items-center px-2 pt-28 pb-12 md:px-8 md:pt-36 md:pb-20">
      <div className="w-full" style={{ perspective: "1000px" }}>
        <Header translate={translate}>{titleComponent}</Header>
        <Card rotate={rotate} scale={scale}>
          {children}
        </Card>
      </div>
      {footer && <div className="mt-10 w-full md:mt-12">{footer}</div>}
    </div>
  );
}

function Header({ translate, children }: { translate: MotionValue<number>; children: ReactNode }) {
  return (
    <motion.div style={{ translateY: translate }} className="mx-auto max-w-5xl text-center">
      {children}
    </motion.div>
  );
}

function Card({ rotate, scale, children }: { rotate: MotionValue<number>; scale: MotionValue<number>; children: ReactNode }) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        transformOrigin: "50% 0%",
        // Layered falloff (contact → ambient), tinted toward the sky so it sits in the gradient.
        boxShadow:
          "0 0 0 1px rgb(15 23 42 / 0.06), 0 9px 20px rgb(30 60 110 / 0.12), 0 37px 37px rgb(30 60 110 / 0.10), 0 84px 50px rgb(30 60 110 / 0.06), 0 149px 60px rgb(30 60 110 / 0.02)",
      }}
      className="relative mx-auto mt-12 w-full max-w-5xl rounded-[22px] bg-white/55 p-1.5 ring-1 ring-white/70 backdrop-blur-xl will-change-transform md:mt-16 md:rounded-[28px] md:p-2.5"
    >
      {/* Bezel highlight: lit from above, faint shade at the bottom edge. */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgb(255_255_255/0.9),inset_0_-1px_0_rgb(15_23_42/0.06)]" />
      <div className="relative overflow-hidden rounded-[16px] bg-white shadow-[0_0_0_1px_rgb(15_23_42/0.08)] md:rounded-[20px]">{children}</div>
    </motion.div>
  );
}
