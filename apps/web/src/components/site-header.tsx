"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"

import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"

const SECTIONS: Record<string, [string, string]> = {
  "/review": ["Review", "Reviews"],
  "/insights": ["Review", "Insights"],
  "/team": ["Review", "Team"],
  "/people": ["Review", "People"],
  "/settings/repositories": ["Settings", "Repositories"],
  "/settings/integrations": ["Settings", "Integrations"],
  "/settings/workspace": ["Settings", "Workspace"],
  "/settings/billing": ["Settings", "Billing"],
  "/settings/account": ["Settings", "Account"],
  "/settings/audit": ["Settings", "Audit log"],
  "/admin/metrics": ["Admin", "Metrics"],
}

/** "Section / Page" for the current route; PR pages show owner/repo #n. */
function crumbs(pathname: string): string[] {
  const exact = SECTIONS[pathname]
  if (exact) return exact
  const pr = pathname.match(/^\/review\/([^/]+)\/([^/]+)\/(\d+)/)
  if (pr) return ["Reviews", `${pr[1]}/${pr[2]} #${pr[3]}`]
  const match = Object.keys(SECTIONS).find((k) => pathname.startsWith(`${k}/`))
  return match ? SECTIONS[match]! : []
}

/** Top bar, 48px: sidebar toggle and breadcrumb on the left; search (opens ⌘K) and theme on the right. */
export function SiteHeader() {
  const path = crumbs(usePathname())
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-4 md:px-6">
      <SidebarTrigger className="-ml-1.5" />
      {path.length > 0 && (
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
          {path.map((c, i) => (
            <span key={c} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span className="text-text-3" aria-hidden>/</span>}
              <span className={i === path.length - 1 ? "truncate font-medium" : "text-muted-foreground"}>{c}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="tex-neutral text-muted-foreground flex h-8 w-9 items-center justify-center gap-2 rounded-full text-xs sm:w-56 sm:justify-start sm:px-3"
          aria-label="Search or jump to"
        >
          <HugeiconsIcon icon={Search01Icon} size={14} aria-hidden />
          <span className="hidden flex-1 text-left sm:inline">Search or jump to…</span>
          <kbd className="bg-muted text-text-3 hidden rounded px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  )
}
