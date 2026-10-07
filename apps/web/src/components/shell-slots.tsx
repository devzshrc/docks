"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createPortal } from "react-dom"

interface Slots {
  filters: HTMLElement | null
  actions: HTMLElement | null
  setHasFilters: (v: boolean) => void
  setHasActions: (v: boolean) => void
}

export const ShellSlotsContext = createContext<Slots | null>(null)

/**
 * The Dashboard Shell pins a toolbar row under the header: `filters` on the left, `toolbarActions` on the right.
 * Pages own their filter state, so they render into those slots with <ShellFilters> and <ShellActions> instead of
 * passing nodes up. The row only exists while something is rendered into it.
 */
function useSlot(kind: "filters" | "actions") {
  const slots = useContext(ShellSlotsContext)
  const set = kind === "filters" ? slots?.setHasFilters : slots?.setHasActions
  useEffect(() => {
    set?.(true)
    return () => set?.(false)
  }, [set])
  return kind === "filters" ? slots?.filters : slots?.actions
}

export function ShellFilters({ children }: { children: React.ReactNode }) {
  const host = useSlot("filters")
  return host ? createPortal(children, host) : null
}

export function ShellActions({ children }: { children: React.ReactNode }) {
  const host = useSlot("actions")
  return host ? createPortal(children, host) : null
}

/** State the frame needs to own the slot hosts. */
export function useShellSlotsState() {
  const [filters, setFilters] = useState<HTMLElement | null>(null)
  const [actions, setActions] = useState<HTMLElement | null>(null)
  const [hasFilters, setHasFilters] = useState(false)
  const [hasActions, setHasActions] = useState(false)
  return { filters, actions, setFilters, setActions, hasFilters, hasActions, setHasFilters, setHasActions }
}
