"use client"

import { errorMessage } from "@/lib/error-message";
import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { PlanCards } from "@/components/plan-cards"
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
        <div className="bg-muted h-1.5 rounded-sm">
          <div
            className={pct >= 100 ? "bg-destructive h-1.5 rounded-sm" : "h-1.5 rounded-sm bg-primary"}
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
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Workspace usage {s.status && s.status !== "active" && <Badge variant="destructive">{s.status.replace("_", " ")}</Badge>}</CardTitle>
          <CardDescription>{s.complimentary ? "Complimentary Team access" : team ? `Team plan${s.currentPeriodEnd ? ` · Renews ${new Date(s.currentPeriodEnd).toLocaleDateString()}` : ""}` : "Free plan · includes up to 5 people and 3 repositories"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-6 sm:grid-cols-2"><Usage label="Members" used={s.usage.members} limit={s.limits.members} /><Usage label="Enabled repositories" used={s.usage.repos} limit={s.limits.repos} /></div>
          {s.canManage && s.hasBillingAccount && <Button variant="outline" onClick={() => portal.mutate({ workspaceId })} disabled={portal.isPending}>Manage billing</Button>}
        </CardContent>
      </Card>
      {checkout && CHECKOUT_STATUS[checkout] && <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">{CHECKOUT_STATUS[checkout]}</p>}
      {s.complimentary && <p role="status" className="rounded-md border border-border-button-default bg-background-primary-default p-4 text-body-2-regular text-text-secondary">Your workspace has complimentary Team access. No subscription charge is created for this access.</p>}
      <PlanCards current={s.plan} actions={{
        free: <Button variant="outline" className="w-full" disabled>{team ? "Included in Team" : "Your current plan"}</Button>,
        team: team ? <Button className="w-full" disabled>You're on Team</Button> : <Button className="w-full" onClick={() => upgrade.mutate({ workspaceId })} disabled={!s.canManage || upgrade.isPending}>{upgrade.isPending ? "Opening checkout…" : "Upgrade to Team"}</Button>,
      }} />
      <p className="text-xs text-muted-foreground">Team is billed monthly per workspace member. Applicable taxes are added at checkout.</p>
      {!s.canManage && <p className="text-sm text-muted-foreground">Only workspace owners can change the plan.</p>}
      {error && <p role="alert" className="text-destructive text-sm">{errorMessage(error)}</p>}
    </div>
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
