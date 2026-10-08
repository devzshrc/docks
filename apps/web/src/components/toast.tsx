"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type Kind = "success" | "error" | "info"
interface ToastItem {
  id: number
  message: string
  kind: Kind
  action?: ToastAction
}

const EVENT = "docks:toast"

/** Fire-and-forget notification; callable from anywhere (event handlers, mutation callbacks). */
export type ToastAction = { label: string; onClick: () => void }

export function toast(message: string, kind: Kind = "success", action?: ToastAction) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind, action } }))
}

let nextId = 1

/** Stack of short-lived messages. Pauses while hovered; errors stay longer. Mount once in the root layout. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = (id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((all) => all.filter((t) => t.id !== id))
  }
  const arm = (id: number, ms: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.set(id, setTimeout(() => dismiss(id), ms))
  }

  useEffect(() => {
    function onToast(e: Event) {
      const { message, kind, action } = (e as CustomEvent<{ message: string; kind: Kind; action?: ToastAction }>).detail
      const id = nextId++
      setItems((all) => [...all.slice(-3), { id, message, kind, action }])
      // Toasts with an action (Undo, Open) stay long enough to use it.
      arm(id, kind === "error" ? 7000 : action ? 6500 : 3500)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:top-auto sm:bottom-0 sm:pt-4 sm:pb-6" aria-live="polite" role="status">
      {items.map((t) => (
        <div
          key={t.id}
          onMouseEnter={() => clearTimeout(timers.current.get(t.id))}
          onMouseLeave={() => arm(t.id, 2000)}
          className="bg-popover text-popover-foreground animate-in fade-in slide-in-from-top-2 sm:slide-in-from-bottom-2 pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border py-2.5 pr-2 pl-3 text-sm shadow-lg duration-200"
        >
          <span
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.kind === "success" && "bg-emerald-500", t.kind === "error" && "bg-red-500", t.kind === "info" && "bg-sky-500")}
            aria-hidden
          />
          <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
              className="text-primary-text hover:bg-hover -my-0.5 shrink-0 rounded-md px-2 py-0.5 text-sm font-medium transition-colors"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground rounded px-1.5 text-base leading-none">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
