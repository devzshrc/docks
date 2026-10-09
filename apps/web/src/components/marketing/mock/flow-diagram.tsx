"use client";

import { RiCheckboxCircleFill, RiGithubFill, RiSlackFill, RiTaskLine } from "@remixicon/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { EASE } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

import { Face } from "./parts";

type Node = { x: number; y: number; side: "left" | "right"; icon: React.ReactNode; title: string; sub: string };

const NODES: Node[] = [
  { x: 4, y: 30, side: "left", icon: <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#111113] text-white"><RiGithubFill className="size-[18px]" /></span>, title: "Pull request opened", sub: "api #418 · +158 −6" },
  { x: 4, y: 70, side: "left", icon: <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#e8f8ee] text-[#16a34a]"><RiCheckboxCircleFill className="size-[18px]" /></span>, title: "Checks passed", sub: "4 of 4 green" },
  { x: 78, y: 22, side: "right", icon: <Face who="mei" className="size-8 text-[10px]" />, title: "Mei Chen", sub: "Code owner for auth" },
  { x: 78, y: 50, side: "right", icon: <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#4a154b] text-white"><RiSlackFill className="size-[18px]" /></span>, title: "#reviews", sub: "Due in 4 work hours" },
  { x: 78, y: 78, side: "right", icon: <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#5e6ad2] text-white"><RiTaskLine className="size-[18px]" /></span>, title: "Linear ENG-212", sub: "Linked to the PR" },
];

const PATHS = [
  { d: "M240,126 C345,126 345,210 450,210", color: "#111113", delay: 0 },
  { d: "M240,294 C345,294 345,210 450,210", color: "#16a34a", delay: 1.1 },
  { d: "M550,210 C665,210 665,92 780,92", color: "#4124fb", delay: 0.5 },
  { d: "M550,210 L780,210", color: "#e01e5a", delay: 1.4 },
  { d: "M550,210 C665,210 665,328 780,328", color: "#5e6ad2", delay: 2 },
];

function NodeCard({ node, className }: { node: Node; className?: string }) {
  return (
    <div className={cn("flex w-[200px] items-center gap-3 rounded-2xl bg-white p-2.5 pr-3 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_30px_-12px_rgb(0_0_0/0.18),0_0_0_1px_rgb(0_0_0/0.05)]", className)}>
      {node.icon}
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-[13.5px] leading-tight font-medium tracking-[-0.01em]">{node.title}</span>
        <span className="flex items-center gap-1 truncate text-[11.5px] text-[#6b6b70]">
          <span className="size-1.5 shrink-0 rounded-full bg-[#22c55e]" />
          {node.sub}
        </span>
      </span>
    </div>
  );
}

function Clock() {
  const reduce = useReducedMotion();
  const [s, setS] = useState(42);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setS((v) => (v + 1) % 3600), 1000);
    return () => clearInterval(t);
  }, [reduce]);
  return <>{`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`}</>;
}

/** GitHub events flow into Docks; Docks routes the review to an owner, nudges Slack and links Linear. */
export function FlowDiagram() {
  const reduce = useReducedMotion();
  return (
    <>
      <div role="img" aria-label="A pull request and its checks flow into Docks. Docks asks the code owner for a review, posts the deadline in Slack and links the Linear issue." className="relative mx-auto hidden aspect-[1000/420] w-full max-w-[1000px] md:block">
        <svg viewBox="0 0 1000 420" className="absolute inset-0 size-full" fill="none" aria-hidden>
          {PATHS.map((p, i) => (
            <g key={i}>
              <motion.path
                d={p.d}
                stroke="#c9c3f5"
                strokeWidth="1.5"
                initial={reduce ? false : { pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, delay: 0.2 + i * 0.12, ease: EASE }}
              />
              {!reduce && (
                <circle r="4" fill={p.color}>
                  <animateMotion dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" path={p.d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          ))}
        </svg>
        {NODES.map((n) => (
          <motion.div
            key={n.title}
            className="absolute -translate-y-1/2"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            initial={reduce ? false : { opacity: 0, x: n.side === "left" ? -16 : 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
          >
            <NodeCard node={n} />
          </motion.div>
        ))}
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <span className="relative flex size-[104px] items-center justify-center">
            {!reduce && [0, 1].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-[32px] border border-[#4124fb]/25"
                animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
                transition={{ duration: 2.6, delay: i * 1.3, repeat: Infinity, ease: "easeOut" }}
              />
            ))}
            <span className="absolute inset-0 rounded-[32px] bg-white shadow-[0_0_0_1px_rgb(65_36_251/0.12),0_24px_50px_-12px_rgb(65_36_251/0.55)]" />
            <AppIcon className="relative size-[76px]" />
          </span>
          <span className="flex items-center gap-2 rounded-full bg-[#4124fb] px-3 py-1.5 text-[11.5px] font-medium tracking-[0.02em] text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-[#22c55e]" />
            ROUTING
            <span className="font-mono text-white/60 tabular-nums"><Clock /></span>
          </span>
        </div>
      </div>
      <div className="mx-auto grid max-w-sm gap-2 md:hidden">
        {NODES.slice(0, 2).map((n) => <NodeCard key={n.title} node={n} className="w-full" />)}
        <div className="my-2 flex items-center justify-center gap-3">
          <AppIcon className="size-12" />
          <span className="text-sm font-medium">Docks routes it</span>
        </div>
        {NODES.slice(2).map((n) => <NodeCard key={n.title} node={n} className="w-full" />)}
      </div>
    </>
  );
}
