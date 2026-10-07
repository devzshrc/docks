"use client"

import { useEffect, useState } from "react"

/**
 * useState that survives refreshes: review drafts live in this browser until submitted.
 * Empty values ("" / []) clear the key, so submitting leaves nothing behind.
 * ponytail: per-browser only; move to a server table if people want drafts across devices.
 */
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      setValue(raw ? (JSON.parse(raw) as T) : initial)
    } catch {
      setValue(initial)
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the key changes
  }, [key])

  useEffect(() => {
    if (!loaded) return
    try {
      const empty = value === "" || (Array.isArray(value) && value.length === 0)
      if (empty) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }, [key, value, loaded])

  return [value, setValue] as const
}
