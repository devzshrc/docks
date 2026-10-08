"use client"

import { useEffect, useMemo, useState } from "react"

import { hunkStreams, type DiffLine } from "@/lib/diff"
import { highlightStreams } from "@/lib/highlight"

/** Whole-file results are cached across remounts (collapse/expand, switching views): file text rarely changes. */
const cache = new Map<string, string[]>()
const remember = (key: string, v: string[]) => {
  cache.set(key, v)
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
}

/**
 * Highlighted HTML for each diff line, computed per hunk and per side in a worker. Returns an empty map until the
 * colours arrive, so rows render as plain text first and never wait on the highlighter.
 */
export function useDiffHighlight(shown: DiffLine[], language: string | null, enabled: boolean) {
  const [map, setMap] = useState<Map<DiffLine, string>>(() => new Map())
  const segments = useMemo(() => (enabled && language ? hunkStreams(shown) : []), [shown, language, enabled])
  useEffect(() => {
    if (!language || segments.length === 0) return
    let live = true
    const streams = segments.flatMap((s) => [s.old.map((l) => l.text), s.new.map((l) => l.text)])
    void highlightStreams(language, streams).then((out) => {
      if (!live) return
      const next = new Map<DiffLine, string>()
      segments.forEach((s, i) => {
        const o = out[i * 2] ?? []
        const n = out[i * 2 + 1] ?? []
        // Context lines belong to both sides; the new side wins so the two columns agree.
        s.old.forEach((l, j) => o[j] !== undefined && next.set(l, o[j]!))
        s.new.forEach((l, j) => n[j] !== undefined && next.set(l, n[j]!))
      })
      setMap(next)
    })
    return () => {
      live = false
    }
  }, [segments, language])
  return map
}

/** Highlighted HTML per line for a whole file (the "full file" view). */
export function useFileHighlight(text: string | undefined, language: string | null, enabled: boolean) {
  const key = text !== undefined && language ? `${language}:${text.length}:${text.slice(0, 64)}:${text.slice(-64)}` : null
  const [lines, setLines] = useState<string[]>(() => (key ? (cache.get(key) ?? []) : []))
  useEffect(() => {
    if (!enabled || !key || text === undefined || !language) return
    const hit = cache.get(key)
    if (hit) return void setLines(hit)
    let live = true
    void highlightStreams(language, [text.split("\n")]).then(([out]) => {
      if (!live || !out?.length) return
      remember(key, out)
      setLines(out)
    })
    return () => {
      live = false
    }
  }, [key, enabled, text, language])
  return lines
}
