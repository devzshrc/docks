import type { ReactNode } from "react"
import { RiCheckLine } from "@remixicon/react"

const plans = [
  { id: "free", name: "Free", price: "0", unit: "Free to get started", description: "A focused review workspace for small teams.", features: ["Up to 5 workspace members", "Up to 3 enabled repositories", "Review board and merge blockers", "Personal inbox and review progress"] },
  { id: "team", name: "Team", price: "12", unit: "USD per member / month", description: "Keep reviews moving. Ship with a clear picture.", features: ["Unlimited members and repositories", "Review deadlines and reminders", "Backup reviewer requests", "Release tracking and readiness reports", "Changes since your last review", "Review evidence exports · CSV and JSON"] },
] as const

export function PlanCards({ current, actions }: { current?: "free" | "team"; actions: Record<"free" | "team", ReactNode> }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {plans.map(plan => (
        <section key={plan.id} className={`flex flex-col rounded-2xl border p-7 sm:p-9 ${plan.id === "team" ? "border-primary/30 bg-primary/[0.04]" : "bg-card"}`}>
          <div className="flex min-h-6 items-center justify-between gap-3">
            <h2 className="text-lg font-medium">{plan.name}</h2>
            {current === plan.id && <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium">Current plan</span>}
          </div>
          <p className="mt-3 min-h-10 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
          <div className="mt-7"><span className="text-5xl font-medium tracking-tight">${plan.price}</span><p className="mt-2 text-xs text-muted-foreground">{plan.unit}</p></div>
          <div className="my-7 h-px bg-border" />
          <ul className="flex-1 space-y-3.5 text-sm">
            {plan.features.map(feature => <li key={feature} className="flex gap-3"><RiCheckLine aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><span>{feature}</span></li>)}
          </ul>
          <div className="mt-9">{actions[plan.id]}</div>
        </section>
      ))}
    </div>
  )
}
