"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

const CHECKOUT_STATUS: Record<string, string> = {
  success: "Thanks for upgrading. Your plan updates as soon as the payment is confirmed.",
  cancelled: "Checkout cancelled. You're still on the free plan.",
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used}
          {limit !== null ? ` of ${limit}` : ""}
        </span>
      </div>
      {limit !== null && (
        <div className="bg-muted h-1.5 rounded-full">
          <div
            className={pct >= 100 ? "bg-destructive h-1.5 rounded-full" : "h-1.5 rounded-full bg-emerald-600"}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function Billing({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const params = useSearchParams()
  const checkout = params.get("checkout")
  const status = useQuery(trpc.billing.status.queryOptions({ workspaceId }))
  const go = (res: { url: string }) => window.location.assign(res.url)
  const upgrade = useMutation(trpc.billing.checkoutUrl.mutationOptions({ onSuccess: go }))
  const portal = useMutation(trpc.billing.portalUrl.mutationOptions({ onSuccess: go }))
  const error = upgrade.error ?? portal.error

  if (status.isPending) return <Skeleton className="h-48 w-full max-w-xl" />
  if (status.error) return <QueryError error={status.error} onRetry={() => void status.refetch()} />
  const s = status.data
  const team = s.plan === "team"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {team ? "Team plan" : "Free plan"}
          {s.status && s.status !== "active" && <Badge variant="destructive">{s.status.replace("_", " ")}</Badge>}
        </CardTitle>
        <CardDescription>
          {team
            ? `Billed per member each month${s.currentPeriodEnd ? `, renews ${new Date(s.currentPeriodEnd).toLocaleDateString()}` : ""}.`
            : "Up to 5 people and 3 repositories. Team removes the limits and is billed per member."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {checkout && CHECKOUT_STATUS[checkout] && <p className="text-sm">{CHECKOUT_STATUS[checkout]}</p>}
        <Usage label="Members" used={s.usage.members} limit={s.limits.members} />
        <Usage label="Enabled repositories" used={s.usage.repos} limit={s.limits.repos} />
        {s.canManage ? (
          <div className="flex gap-2">
            {!team && (
              <Button onClick={() => upgrade.mutate({ workspaceId })} disabled={upgrade.isPending}>
                Upgrade to Team
              </Button>
            )}
            {s.hasBillingAccount && (
              <Button variant="outline" onClick={() => portal.mutate({ workspaceId })} disabled={portal.isPending}>
                Manage billing
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Only workspace owners can change the plan.</p>
        )}
        {error && <p className="text-destructive text-sm">{error.message}</p>}
      </CardContent>
    </Card>
  )
}

function Content() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) {
    return (
      <p className="text-muted-foreground text-sm">
        You aren&apos;t in a workspace yet.{" "}
        <Link href="/settings/integrations" className="underline">
          Create one
        </Link>{" "}
        or ask a teammate for an invite link.
      </p>
    )
  }
  return (
    <Suspense>
      <Billing workspaceId={workspace.id} />
    </Suspense>
  )
}

export default function Page() {
  return (
    <AppShell title="Billing" description="Your plan, usage and payment details.">
      <Content />
    </AppShell>
  )
}
