"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** Height-animated show/hide (grid 0fr→1fr). Children stay mounted so state survives collapsing. */
export function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0", className)}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** A number that rolls in from below when it changes. */
export function Count({ value, className }: { value: number | string; className?: string }) {
  return (
    <span key={value} className={cn("animate-in fade-in slide-in-from-bottom-1 inline-block tabular-nums duration-200", className)}>
      {value}
    </span>
  )
}

/** Tick that draws itself once. */
export function DrawTick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={cn("draw-tick size-4", className)} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
    </svg>
  )
}

/** Briefly tints an element so the eye lands on it after a jump. */
export function flash(el: Element | null) {
  el?.animate(
    [{ backgroundColor: "color-mix(in oklch, var(--primary) 14%, transparent)" }, { backgroundColor: "transparent" }],
    { duration: 900, easing: "ease-out" }
  )
}

/** True for one render pass after `value` flips to `target` (e.g. a bar reaching 100%). */
export function useJustBecame(value: boolean) {
  const prev = useRef(value)
  const [fired, setFired] = useState(false)
  useEffect(() => {
    const rose = value && !prev.current
    prev.current = value
    if (!rose) return
    setFired(true)
    const t = setTimeout(() => setFired(false), 800)
    return () => clearTimeout(t)
  }, [value])
  return fired
}

/**
 * A highlight that glides to the active row of a listbox (⌘K, file finder) instead of jumping.
 * The list container must be `relative`; rows carry data-idx. Rows should not paint their own active background.
 */
export function SlidingHighlight({ listRef, active, watch }: { listRef: React.RefObject<HTMLElement | null>; active: number; watch?: unknown }) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    setBox(row ? { top: row.offsetTop, height: row.offsetHeight } : null)
  }, [listRef, active, watch])
  if (!box) return null
  return (
    <div
      aria-hidden
      className="bg-accent pointer-events-none absolute inset-x-2 rounded-lg transition-[transform,height] duration-150 ease-out motion-reduce:transition-none"
      style={{ transform: `translateY(${box.top}px)`, height: box.height, top: 0 }}
    />
  )
}
