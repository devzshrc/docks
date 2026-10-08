import { highlightStream } from "./highlight-core"

type Req = { id: number; language: string; streams: string[][] }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, language, streams } = e.data
  const out = streams.map((lines) => {
    try {
      return highlightStream(language, lines)
    } catch {
      return []
    }
  })
  ;(self as unknown as Worker).postMessage({ id, out })
}
