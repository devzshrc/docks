"use client"

import { Analytics01Icon, CheckListIcon, GitPullRequestIcon, Search01Icon, Settings02Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"


import { RequireAuth } from "@/components/auth-guard"
import { CommandPalette } from "@/components/command-palette"
import { NewIssueButton } from "@/components/new-issue/button"
import { NewIssueProvider } from "@/components/new-issue/provider"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  if (pathname.startsWith("/deadlines")) return "deadlines";
  if (pathname.startsWith("/releases")) return "releases";
  if (pathname.startsWith("/inbox")) return "inbox";
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
        <span className="text-muted-foreground font-normal">Reviews / </span>
        {pr[1]}/{pr[2]} <span className="text-muted-foreground font-normal">#{pr[3]}</span>
      </>
    )
  }
  const issue = pathname.match(/^\/issues\/([^/]+)\/([^/]+)\/(\d+)/)
  if (issue) {
    return (
      <>
        <span className="text-muted-foreground font-normal">Issues / </span>
        {issue[1]}/{issue[2]} <span className="text-muted-foreground font-normal">#{issue[3]}</span>
      </>
    )
  }
  return title ?? ""
}

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
        <ShellFrame title={title} description={description} actions={actions} width={width}>
          {children}
        </ShellFrame>
        <CommandPalette />
      </NewIssueProvider>
    </RequireAuth>
  )
}

function ShellFrame({ title, description, actions, width, children }: { title?: string; description?: React.ReactNode; actions?: React.ReactNode; width: keyof typeof WIDTH; children: React.ReactNode }) {
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
  const inbox = useQuery({
    ...trpc.inbox.unreadCount.queryOptions({
      workspaceId: workspace?.id ?? "",
    }),
    enabled: Boolean(workspace),
    refetchInterval: 30_000,
    retry: false,
  });
  const waitingCount = waiting.data?.cards.length ?? 0

  // Open issues nobody has picked up: the triage queue.
  const triage = useQuery({
    ...trpc.issues.counts.queryOptions({ workspaceId: workspace?.id ?? "" }),
    enabled: Boolean(workspace),
    staleTime: 60_000,
    retry: false,
  })
  const triageCount = triage.data?.triage ?? 0

  const nav = [
    { id: "deadlines", label: "Deadlines", icon: ReviewsIcon, href: "/deadlines", count: 0 },
    { id: "releases", label: "Releases", icon: IssuesIcon, href: "/releases", count: 0 },
    {
      id: "inbox",
      label: "Inbox",
      icon: IssuesIcon,
      href: "/inbox",
      count: inbox.data ?? 0,
    },
    { id: "reviews", label: "Reviews", icon: ReviewsIcon, href: "/review", count: waitingCount },
    { id: "issues", label: "Issues", icon: IssuesIcon, href: "/issues", count: triageCount },
    { id: "insights", label: "Insights", icon: InsightsIcon, href: "/insights", count: 0 },
    { id: "team", label: "Team", icon: TeamIcon, href: "/team", count: 0 },
  ]
  const activeId = activeIdFor(pathname)

  const canAudit = settings.data ? settings.data.can["audit.read"] : true
  const tabs = SETTINGS_TABS.filter((t) => t.value !== "/settings/audit" || canAudit)
  const activeTab = tabs.find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? tabs[0]!.value

  const intro = inSettings ? (
    (title || description) && (
      <div className="space-y-1">
        {title && <h2 className="text-base font-medium tracking-tight">{title}</h2>}
        {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
      </div>
    )
  ) : (
    description && <p data-page-intro className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p>
  )

  return (
    <ShellSlotsContext.Provider value={{ filters: slots.filters, actions: slots.actions, setHasFilters: slots.setHasFilters, setHasActions: slots.setHasActions }}>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
        <Sidebar>
          <SidebarHeader className="px-3 py-3">
            <Link href="/review" className="flex items-center gap-2.5 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <BrandMark />
              <span className="grid leading-tight">
                <span className="text-sm font-medium">Docks</span>
                <span className="text-muted-foreground truncate text-xs">{workspace?.name ?? "Code review"}</span>
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Review</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map((n) => (
                    <SidebarMenuItem key={n.id}>
                      <SidebarMenuButton asChild isActive={activeId === n.id}>
                        <Link href={n.href}>
                          <n.icon />
                          <span>{n.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {n.count > 0 && <SidebarMenuBadge>{n.count}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="gap-1 p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeId === "settings"}>
                  <Link href="/settings/workspace">
                    <SettingsIcon />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <UserMenu />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="bg-background/80 sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
            <SidebarTrigger className="-ml-1.5" />
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">{inSettings ? "Settings" : titleFor(pathname, title)}</h1>
            <div className="flex items-center gap-2">
              {actions}
              <Button
                variant="outline"
                size="sm"
                aria-label="Search or jump to"
                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                className="gap-2 shadow-xs"
              >
                <HugeiconsIcon icon={Search01Icon} size={12} aria-hidden />
                <span className="hidden sm:inline">Search</span>
                <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
              </Button>
              <NewIssueButton />
              <ThemeToggle />
            </div>
          </header>
          {inSettings && (
            <div className="border-b px-4 md:px-6">
              <Tabs value={activeTab} onValueChange={(v) => router.push(v)}>
                <TabsList variant="line" className="h-10 gap-1 bg-transparent p-0">
                  {tabs.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}
          {(slots.hasFilters || slots.hasActions) && (
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
              {slots.hasFilters && <div ref={slots.setFilters} className="contents" />}
              {slots.hasActions && <div ref={slots.setActions} className="ml-auto flex items-center gap-2" />}
            </div>
          )}
          <div className={cn("animate-in fade-in slide-in-from-bottom-1 flex w-full min-w-0 flex-col gap-8 px-4 py-6 duration-200 md:px-6 md:py-8", WIDTH[width])}>
            {intro}
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ShellSlotsContext.Provider>
  )
}

function BrandMark() {
  return (
    <span className="bg-foreground text-background flex size-7 items-center justify-center rounded-lg text-xs font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]" aria-hidden>
      D
    </span>
  )
}
