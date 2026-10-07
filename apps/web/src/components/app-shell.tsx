"use client"

import { Analytics01Icon, CheckListIcon, GitPullRequestIcon, Search01Icon, Settings02Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { RequireAuth } from "@/components/auth-guard"
import { CommandPalette } from "@/components/command-palette"
import { NewIssueButton } from "@/components/new-issue/button"
import { NewIssueProvider } from "@/components/new-issue/provider"
import { DashboardButton, DashboardShell, type DashboardShellNavSection } from "@/components/obsidian/dashboard-shell"
import { ShellSlotsContext, useShellSlotsState } from "@/components/shell-slots"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const WIDTH = {
  narrow: "max-w-[720px]", // single-column forms
  default: "max-w-[1200px]", // every dashboard and settings page shares one left edge
  wide: "max-w-[1360px]", // board and code review
} as const

/** Hugeicons as shell nav icons (the shell passes `className` to its icon component). */
const icon = (i: typeof GitPullRequestIcon) =>
  function NavIcon({ className }: { className?: string }) {
    return <HugeiconsIcon icon={i} size={16} className={className} />
  }
const ReviewsIcon = icon(GitPullRequestIcon)
const IssuesIcon = icon(CheckListIcon)
const InsightsIcon = icon(Analytics01Icon)
const TeamIcon = icon(UserGroupIcon)
const SettingsIcon = icon(Settings02Icon)

const SETTINGS_TABS = [
  { value: "/settings/workspace", label: "Workspace" },
  { value: "/settings/repositories", label: "Repositories" },
  { value: "/settings/integrations", label: "Integrations" },
  { value: "/settings/billing", label: "Billing" },
  { value: "/settings/audit", label: "Audit log" },
  { value: "/settings/account", label: "Account" },
]

function activeIdFor(pathname: string) {
  if (pathname.startsWith("/settings")) return "settings"
  if (pathname.startsWith("/insights")) return "insights"
  if (pathname.startsWith("/team") || pathname.startsWith("/people")) return "team"
  if (pathname.startsWith("/issues")) return "issues"
  if (pathname.startsWith("/review")) return "reviews"
  return undefined
}

/** "Reviews / owner/repo #12" for pull request pages, otherwise the page's own title. */
function titleFor(pathname: string, title?: string) {
  const pr = pathname.match(/^\/review\/([^/]+)\/([^/]+)\/(\d+)/)
  if (pr) {
    return (
      <>
        <span className="text-(--obsidian-dashboard-shell-text-subtle) font-normal">Reviews / </span>
        {pr[1]}/{pr[2]} <span className="text-(--obsidian-dashboard-shell-text-subtle) font-normal">#{pr[3]}</span>
      </>
    )
  }
  const issue = pathname.match(/^\/issues\/([^/]+)\/([^/]+)\/(\d+)/)
  if (issue) {
    return (
      <>
        <span className="text-(--obsidian-dashboard-shell-text-subtle) font-normal">Issues / </span>
        {issue[1]}/{issue[2]} <span className="text-(--obsidian-dashboard-shell-text-subtle) font-normal">#{issue[3]}</span>
      </>
    )
  }
  return title ?? ""
}

const WIDTH_KEY = "docks:sidebar-width"

/**
 * Authenticated page chrome, built on ObsidianUI's DashboardShell: resizable sidebar with a sliding active pill,
 * mobile drawer, title row with actions, and tabs for Settings. Pages keep passing title, description, actions, width.
 */
export function AppShell({
  title,
  description,
  actions,
  width = "default",
  children,
}: {
  /** Omit for pages that render their own heading (e.g. a pull request). */
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  width?: keyof typeof WIDTH
  children: React.ReactNode
}) {
  return (
    <RequireAuth>
      <NewIssueProvider>
        <Frame title={title} description={description} actions={actions} width={width}>
          {children}
        </Frame>
        <CommandPalette />
      </NewIssueProvider>
    </RequireAuth>
  )
}

function Frame({ title, description, actions, width, children }: { title?: string; description?: React.ReactNode; actions?: React.ReactNode; width: keyof typeof WIDTH; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const trpc = useTRPC()
  const { workspace } = useWorkspace()
  const settings = useWorkspaceSettings(workspace?.id)
  const inSettings = pathname.startsWith("/settings")
  const slots = useShellSlotsState()

  // PRs waiting on this person: the one number worth showing in the sidebar.
  const waiting = useQuery({
    ...trpc.review.board.queryOptions({ workspaceId: workspace?.id ?? "", filters: { sort: "oldest", waitingOnMe: true } }),
    enabled: Boolean(workspace),
    staleTime: 60_000,
    retry: false,
  })
  const waitingCount = waiting.data?.cards.length ?? 0

  // Open issues nobody has picked up: the triage queue.
  const triage = useQuery({
    ...trpc.issues.counts.queryOptions({ workspaceId: workspace?.id ?? "" }),
    enabled: Boolean(workspace),
    staleTime: 60_000,
    retry: false,
  })
  const triageCount = triage.data?.triage ?? 0

  const navigation = useMemo<DashboardShellNavSection[]>(
    () => [
      {
        id: "review",
        title: "Review",
        items: [
          { id: "reviews", label: "Reviews", icon: ReviewsIcon, href: "/review", count: waitingCount > 0 ? waitingCount : undefined },
          { id: "issues", label: "Issues", icon: IssuesIcon, href: "/issues", count: triageCount > 0 ? triageCount : undefined },
          { id: "insights", label: "Insights", icon: InsightsIcon, href: "/insights" },
          { id: "team", label: "Team", icon: TeamIcon, href: "/team" },
        ],
      },
    ],
    [waitingCount, triageCount]
  )

  // Sidebar width is remembered per browser.
  const [sidebarWidth, setSidebarWidth] = useState(240)
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY))
      if (saved >= 200 && saved <= 400) setSidebarWidth(saved)
    } catch {}
  }, [])

  const canAudit = settings.data ? settings.data.can["audit.read"] : true
  const tabs = SETTINGS_TABS.filter((t) => t.value !== "/settings/audit" || canAudit)
  const activeTab = tabs.find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? tabs[0]!.value

  const headerActions = (
    <>
      {actions}
      <DashboardButton
        variant="secondary"
        aria-label="Search or jump to"
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="gap-2"
      >
        <HugeiconsIcon icon={Search01Icon} size={12} aria-hidden />
        <span className="hidden sm:inline">Search</span>
        <kbd className="bg-muted text-text-3 hidden rounded px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </DashboardButton>
      <NewIssueButton />
      <ThemeToggle />
    </>
  )

  const intro = inSettings ? (
    (title || description) && (
      <div className="space-y-1">
        {title && <h2 className="text-base font-medium tracking-tight">{title}</h2>}
        {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
      </div>
    )
  ) : (
    description && <p className="text-muted-foreground -mt-2 max-w-2xl text-sm">{description}</p>
  )

  return (
    <ShellSlotsContext.Provider value={{ filters: slots.filters, actions: slots.actions, setHasFilters: slots.setHasFilters, setHasActions: slots.setHasActions }}>
    <div className="h-dvh">
      <DashboardShell
        brand={{ name: "Docks", description: workspace?.name, logo: <BrandMark /> }}
        navigation={navigation}
        secondaryNavigation={[{ id: "settings", label: "Settings", icon: SettingsIcon, href: "/settings/workspace" }]}
        sidebarFooter={<UserMenu />}
        activeItemId={activeIdFor(pathname)}
        title={inSettings ? "Settings" : titleFor(pathname, title)}
        headerActions={headerActions}
        tabs={inSettings ? tabs : undefined}
        tab={inSettings ? activeTab : undefined}
        onTabChange={(value) => router.push(value)}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={(w) => {
          setSidebarWidth(w)
          try {
            localStorage.setItem(WIDTH_KEY, String(w))
          } catch {}
        }}
        filters={slots.hasFilters ? <div ref={slots.setFilters} className="contents" /> : undefined}
        toolbarActions={slots.hasActions ? <div ref={slots.setActions} className="contents" /> : undefined}
        className="h-dvh"
      >
        {/* Left-aligned with the header and the toolbar (all at 16px), so every page shares one left edge. */}
        <div className={cn("animate-in fade-in slide-in-from-bottom-1 flex w-full min-w-0 flex-col gap-6 px-4 py-4 duration-200 md:py-6", WIDTH[width])}>
          {intro}
          {children}
        </div>
      </DashboardShell>
    </div>
    </ShellSlotsContext.Provider>
  )
}

function BrandMark() {
  return (
    <span className="bg-foreground text-background flex size-6 items-center justify-center rounded-md text-xs font-medium" aria-hidden>
      D
    </span>
  )
}
