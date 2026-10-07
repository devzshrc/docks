import { cn } from "@/lib/utils"

const LINES: { n: number; kind: "ctx" | "add" | "del"; text: string }[] = [
  { n: 1, kind: "ctx", text: "export const rateLimit = {" },
  { n: 2, kind: "del", text: "  allow: async () => true," },
  { n: 2, kind: "add", text: "  async allow(key: string, max = 5) {" },
  { n: 3, kind: "add", text: "    const bucket = buckets.get(key)" },
  { n: 4, kind: "add", text: "    if (bucket.count >= max) return false" },
  { n: 5, kind: "ctx", text: "  }," },
]

/** A quiet picture of guided review: the guide's summary, its steps, and the diff for step one. */
export function ReviewPreview({ className }: { className?: string }) {
  return (
    <div className={cn("bg-background border-hairline overflow-hidden rounded-2xl border", className)} role="img" aria-label="Guided review: a summary of the change, three steps, and the diff for the first step">
      <div className="border-hairline space-y-3 border-b p-4">
        <p className="text-sm leading-relaxed">Adds per-IP rate limiting to login and a unit test for the limiter.</p>
        <div className="flex flex-wrap gap-1.5">
          {["1 Rate limiter", "2 Login flow", "3 Tests"].map((s, i) => (
            <span key={s} className={cn("rounded-full px-2.5 py-1 text-[11px]", i === 0 ? "bg-raised shadow-(--ring-raised) font-medium" : "text-muted-foreground border-hairline border")}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="font-code text-[11.5px] leading-6">
        <div className="text-muted-foreground border-hairline border-b px-4 py-1.5 font-sans text-[11px]">src/rate-limit.ts</div>
        {LINES.map((l, i) => (
          <div key={i} className={cn("flex gap-3 px-4", l.kind === "add" && "bg-success/10", l.kind === "del" && "bg-danger/10")}>
            <span className="text-text-3 w-4 text-right select-none">{l.n}</span>
            <span className="text-text-3 select-none">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
            <span className="truncate">{l.text}</span>
          </div>
        ))}
      </div>
      <div className="border-hairline text-muted-foreground flex items-center gap-2 border-t px-4 py-3 text-xs">
        <span className="border-input size-3.5 rounded border" />
        Does every caller pass the client IP?
      </div>
      <div className="border-hairline flex items-center gap-2 border-t bg-muted/40 px-4 py-3">
        <span className="bg-success text-white rounded-full px-2.5 py-1 text-[11px] font-medium">Approve</span>
        <span className="border-hairline text-muted-foreground rounded-full border px-2.5 py-1 text-[11px]">Request changes</span>
        <span className="border-hairline text-muted-foreground rounded-full border px-2.5 py-1 text-[11px]">Merge</span>
        <span className="text-text-3 ml-auto text-[11px]">without leaving the page</span>
      </div>
    </div>
  )
}
