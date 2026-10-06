"use client"

import type { Guide } from "@docks/api"
import { useEffect, useState } from "react"

/**
 * Reviewer checklist questions linked to files (§5.3). Ticks are a personal
 * aid kept in this browser, per commit; they're never posted to GitHub.
 */
export function Checklist({
  items,
  storageKey,
}: {
  items: Guide["checklist"]
  storageKey: string
}) {
  const [done, setDone] = useState<number[]>([])

  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(storageKey) ?? "[]"))
    } catch {
      setDone([])
    }
  }, [storageKey])

  function toggle(i: number) {
    const next = done.includes(i) ? done.filter((d) => d !== i) : [...done, i]
    setDone(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {}
  }

  if (!items.length) return null

  return (
    <section aria-labelledby="checklist-heading" className="space-y-2">
      <h3 id="checklist-heading" className="flex justify-between text-sm font-medium">
        Before you approve
        <span className="text-muted-foreground font-normal">
          {done.length} of {items.length}
        </span>
      </h3>
      <ul className="space-y-2 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <input
              type="checkbox"
              id={`check-${i}`}
              className="mt-0.5 size-4 shrink-0"
              checked={done.includes(i)}
              onChange={() => toggle(i)}
            />
            <div className="min-w-0">
              <label htmlFor={`check-${i}`} className={done.includes(i) ? "text-muted-foreground line-through" : ""}>
                {item.question}
              </label>
              {item.files.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-x-2">
                  {item.files.map((f) => (
                    <a key={f} href={`#file-${f}`} className="text-muted-foreground truncate font-mono text-xs underline">
                      {f.split("/").pop()}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
