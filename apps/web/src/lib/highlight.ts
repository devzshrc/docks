/**
 * Syntax highlighting off the main thread. Streams (arrays of lines) go to a Web Worker and come back as one HTML
 * string per line; if workers are unavailable the same work runs on the main thread in the background instead.
 * Callers show plain text first and swap the colours in, so scrolling never waits on a highlighter.
 */
type Pending = { resolve: (v: string[][]) => void }

let worker: Worker | null = null
let failed = false
let next = 0
const pending = new Map<number, Pending>()

function getWorker() {
  if (worker || failed || typeof Worker === "undefined") return worker
  try {
    worker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<{ id: number; out: string[][] }>) => {
      pending.get(e.data.id)?.resolve(e.data.out)
      pending.delete(e.data.id)
    }
    worker.onerror = () => {
      failed = true
      worker = null
      for (const p of pending.values()) p.resolve([])
      pending.clear()
    }
  } catch {
    failed = true
  }
  return worker
}

export async function highlightStreams(language: string, streams: string[][]): Promise<string[][]> {
  const w = getWorker()
  if (w) {
    return new Promise((resolve) => {
      const id = next++
      pending.set(id, { resolve })
      w.postMessage({ id, language, streams })
    })
  }
  const { highlightStream } = await import("./highlight-core")
  const out: string[][] = []
  for (const s of streams) {
    await new Promise((r) => setTimeout(r, 0)) // yield between streams so input stays responsive
    try {
      out.push(highlightStream(language, s))
    } catch {
      out.push([])
    }
  }
  return out
}
