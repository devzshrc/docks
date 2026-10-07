"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"

const WORKSPACE = [
  { label: "Workspace", href: "/settings/workspace", hint: "Name, members, teams, security" },
  { label: "Repositories", href: "/settings/repositories", hint: "What appears on the board" },
  { label: "Integrations", href: "/settings/integrations", hint: "GitHub, Slack, Linear" },
  { label: "Billing", href: "/settings/billing", hint: "Plan and payment" },
  { label: "Audit log", href: "/settings/audit", hint: "Who changed what" },
] as const

/**
 * The one place settings live. Workspace tabs on the left, the person's own Account on the right;
 * pages the signed-in role can't use are left out instead of greyed.
 */
export function SettingsTabs() {
  const pathname = usePathname()
  const { workspace } = useWorkspace()
  const settings = useWorkspaceSettings(workspace?.id)
  const canAudit = settings.data ? settings.data.can["audit.read"] : true
  const tabs = WORKSPACE.filter((t) => t.href !== "/settings/audit" || canAudit)

  const tab = (t: { label: string; href: string }) => {
    const active = pathname === t.href || pathname.startsWith(`${t.href}/`)
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-10 shrink-0 items-center px-0.5 text-sm font-medium whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
          active ? "text-foreground after:bg-foreground" : "text-muted-foreground hover:text-foreground after:bg-transparent"
        )}
      >
        {t.label}
      </Link>
    )
  }

  return (
    <nav aria-label="Settings" className="border-hairline -mt-3 flex items-center gap-6 overflow-x-auto border-b max-sm:-mx-4 max-sm:px-4">
      {tabs.map(tab)}
      <span className="ml-auto flex shrink-0 items-center gap-6 pl-6">{tab({ label: "Account", href: "/settings/account" })}</span>
    </nav>
  )
}
