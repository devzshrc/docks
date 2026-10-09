"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import {
  RiCalendarScheduleLine,
  RiRocketLine,
  RiInboxLine,
  RiGitPullRequestLine,
  RiBugLine,
  RiBarChartBoxLine,
  RiTeamLine,
  RiSettings3Line,
  RiUserAddLine,
  RiWallet3Line,
  RiNotification3Line,
} from "@remixicon/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { RequireAuth } from "@/components/auth-guard";
import { CommandPalette } from "@/components/command-palette";
import { NewIssueButton } from "@/components/new-issue/button";
import { NewIssueProvider } from "@/components/new-issue/provider";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
} from "@/components/ui/sidebar";
import {
  Tabs,
  TabsList as TabList,
  TabsTrigger as Tab,
} from "@/components/ui/tabs";
import { AppIcon } from "@/components/app-icon";
import { HueIcon, type Hue } from "@/components/ui/empty-preview";
import {
  ShellSlotsContext,
  useShellSlotsState,
} from "@/components/shell-slots";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

const WIDTH = {
  narrow: "max-w-[720px]", // single-column forms
  default: "max-w-[1200px]", // every dashboard and settings page shares one left edge
  wide: "max-w-[1360px]", // board and code review
} as const;

const SECTION: Record<string, { icon: typeof RiInboxLine; hue: Hue }> = {
  inbox: { icon: RiInboxLine, hue: "blue" },
  reviews: { icon: RiGitPullRequestLine, hue: "indigo" },
  issues: { icon: RiBugLine, hue: "green" },
  deadlines: { icon: RiCalendarScheduleLine, hue: "amber" },
  releases: { icon: RiRocketLine, hue: "pink" },
  insights: { icon: RiBarChartBoxLine, hue: "teal" },
  team: { icon: RiTeamLine, hue: "orange" },
  settings: { icon: RiSettings3Line, hue: "purple" },
};

const SETTINGS_TABS = [
  { value: "/settings/workspace", label: "Workspace" },
  { value: "/settings/repositories", label: "Repositories" },
  { value: "/settings/integrations", label: "Integrations" },
  { value: "/settings/billing", label: "Billing" },
  { value: "/settings/audit", label: "Audit log" },
  { value: "/settings/account", label: "Account" },
];

function activeIdFor(pathname: string) {
  if (pathname.startsWith("/deadlines")) return "deadlines";
  if (pathname.startsWith("/releases")) return "releases";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/insights")) return "insights";
  if (pathname.startsWith("/team") || pathname.startsWith("/people"))
    return "team";
  if (pathname.startsWith("/issues")) return "issues";
  if (pathname.startsWith("/review")) return "reviews";
  return undefined;
}

/** "Reviews / owner/repo #12" for pull request pages, otherwise the page's own title. */
function titleFor(pathname: string, title?: string) {
  const pr = pathname.match(/^\/review\/([^/]+)\/([^/]+)\/(\d+)/);
  if (pr) {
    return (
      <>
        <span className="text-muted-foreground font-normal">Reviews / </span>
        {pr[1]}/{pr[2]}{" "}
        <span className="text-muted-foreground font-normal">#{pr[3]}</span>
      </>
    );
  }
  const issue = pathname.match(/^\/issues\/([^/]+)\/([^/]+)\/(\d+)/);
  if (issue) {
    return (
      <>
        <span className="text-muted-foreground font-normal">Issues / </span>
        {issue[1]}/{issue[2]}{" "}
        <span className="text-muted-foreground font-normal">#{issue[3]}</span>
      </>
    );
  }
  return title ?? "";
}

/**
 * Authenticated page chrome, built on shadcn Sidebar: resizable sidebar with a sliding active pill,
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
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  width?: keyof typeof WIDTH;
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <NewIssueProvider>
        <ShellFrame
          title={title}
          description={description}
          actions={actions}
          width={width}
        >
          {children}
        </ShellFrame>
        <CommandPalette />
      </NewIssueProvider>
    </RequireAuth>
  );
}

function ShellFrame({
  title,
  description,
  actions,
  width,
  children,
}: {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  width: keyof typeof WIDTH;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();
  const { workspace } = useWorkspace();
  const settings = useWorkspaceSettings(workspace?.id);
  const billing = useQuery({
    ...trpc.billing.status.queryOptions({ workspaceId: workspace?.id ?? "" }),
    enabled: Boolean(workspace),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const inSettings = pathname.startsWith("/settings");
  const slots = useShellSlotsState();

  // PRs waiting on this person: the one number worth showing in the sidebar.
  const waiting = useQuery({
    ...trpc.review.board.queryOptions({
      workspaceId: workspace?.id ?? "",
      filters: { sort: "oldest", waitingOnMe: true },
    }),
    enabled: Boolean(workspace),
    staleTime: 60_000,
    retry: false,
  });
  const inbox = useQuery({
    ...trpc.inbox.unreadCount.queryOptions({
      workspaceId: workspace?.id ?? "",
    }),
    enabled: Boolean(workspace),
    refetchInterval: 30_000,
    retry: false,
  });
  const waitingCount = waiting.data?.cards.length ?? 0;

  // Open issues nobody has picked up: the triage queue.
  const triage = useQuery({
    ...trpc.issues.counts.queryOptions({ workspaceId: workspace?.id ?? "" }),
    enabled: Boolean(workspace),
    staleTime: 60_000,
    retry: false,
  });
  const triageCount = triage.data?.triage ?? 0;

  const navGroups: {
    title?: string;
    items: {
      id: string;
      label: string;
      icon: typeof RiInboxLine;
      href: string;
      count: number;
      tint: string;
    }[];
  }[] = [
    {
      items: [
        { id: "inbox", label: "Inbox", icon: RiInboxLine, href: "/inbox", count: inbox.data ?? 0, tint: "text-hue-blue!" },
        { id: "reviews", label: "Reviews", icon: RiGitPullRequestLine, href: "/review", count: waitingCount, tint: "text-hue-indigo!" },
        { id: "issues", label: "Issues", icon: RiBugLine, href: "/issues", count: triageCount, tint: "text-hue-green!" },
      ],
    },
    {
      title: "Planning",
      items: [
        { id: "deadlines", label: "Deadlines", icon: RiCalendarScheduleLine, href: "/deadlines", count: 0, tint: "text-hue-amber!" },
        { id: "releases", label: "Releases", icon: RiRocketLine, href: "/releases", count: 0, tint: "text-hue-pink!" },
      ],
    },
    {
      title: "Team",
      items: [
        { id: "insights", label: "Insights", icon: RiBarChartBoxLine, href: "/insights", count: 0, tint: "text-hue-teal!" },
        { id: "team", label: "People", icon: RiTeamLine, href: "/team", count: 0, tint: "text-hue-orange!" },
      ],
    },
  ];
  const activeId = activeIdFor(pathname);
  const section = activeId ? SECTION[activeId] : undefined;

  const canAudit = settings.data ? settings.data.can["audit.read"] : true;
  const tabs = SETTINGS_TABS.filter(
    (t) => t.value !== "/settings/audit" || canAudit,
  );
  const activeTab =
    tabs.find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))
      ?.value ?? tabs[0]!.value;

  const intro = inSettings
    ? (title || description) && (
        <div className="space-y-1">
          {title && (
            <h2 className="text-base font-medium tracking-tight">{title}</h2>
          )}
          {description && (
            <p className="text-muted-foreground max-w-2xl text-sm">
              {description}
            </p>
          )}
        </div>
      )
    : description && (
        <p
          data-page-intro
          className="text-muted-foreground max-w-2xl text-sm leading-relaxed"
        >
          {description}
        </p>
      );

  return (
    <ShellSlotsContext.Provider
      value={{
        filters: slots.filters,
        actions: slots.actions,
        setHasFilters: slots.setHasFilters,
        setHasActions: slots.setHasActions,
      }}
    >
      <SidebarProvider
        style={{ "--sidebar-width": "15.875rem" } as React.CSSProperties}
      >
        <Sidebar className="border-sidebar-border">
          <SidebarHeader className="border-sidebar-border bg-sidebar-accent gap-0 border-b p-3">
            <Link
              href="/review"
              className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <AppIcon className="size-8 shrink-0" />
              <span className="grid min-w-0 gap-1 leading-none">
                <span className="truncate text-sm font-medium tracking-[-0.01em]">
                  {workspace?.name ?? "Docks"}
                </span>
                <span className="text-subtle truncate text-xs">
                  Code review workspace
                </span>
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="gap-0">
            {navGroups.map((group, i) => (
              <SidebarGroup
                key={group.title ?? i}
                className={cn(
                  "gap-1 p-3",
                  i < navGroups.length - 1 && "border-sidebar-border border-b",
                )}
              >
                {group.title && (
                  <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0">
                    {group.items.map((n) => (
                      <SidebarMenuItem
                        key={n.id}
                        className={cn(activeId === n.id && "my-px")}
                      >
                        <SidebarMenuButton asChild isActive={activeId === n.id}>
                          <Link href={n.href}>
                            <n.icon className={n.tint} />
                            <span>{n.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {n.count > 0 && (
                          <SidebarMenuBadge>{n.count}</SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter className="gap-0 p-0">
            <SidebarMenu className="border-sidebar-border gap-0 border-t p-3">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeId === "settings"}>
                  <Link href="/settings/workspace">
                    <RiSettings3Line />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/team">
                    <RiUserAddLine />
                    <span>Invite teammates</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {billing.data && (
              <div className="border-sidebar-border bg-sidebar-accent flex items-center justify-between gap-2 border-t p-4">
                <div className="grid min-w-0 gap-1.5 leading-none">
                  <span className="truncate text-sm font-medium tracking-[-0.01em]">
                    {billing.data.plan === "team" ? "Team plan" : "Free plan"}
                  </span>
                  <span className="text-subtle truncate text-xs">
                    {billing.data.plan === "team"
                      ? "Every review tool on"
                      : "Up to 5 people"}
                  </span>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/settings/billing">
                    <RiWallet3Line aria-hidden />
                    {billing.data.plan === "team" ? "Billing" : "Upgrade"}
                  </Link>
                </Button>
              </div>
            )}
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="bg-background/85 sticky top-0 z-20 shrink-0 backdrop-blur-md">
            <div className="flex h-[58px] items-center gap-2 px-4 md:px-5">
              <SidebarTrigger className="text-muted-foreground -ml-1 rounded-full" />
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {section && <HueIcon icon={section.icon} hue={section.hue} className="hidden size-6 rounded-md sm:inline-flex [&_svg]:size-3" />}
                <h1 className="min-w-0 truncate text-base leading-none font-medium tracking-[-0.01em]">
                  {inSettings ? "Settings" : titleFor(pathname, title)}
                </h1>
                {billing.data && !inSettings && (
                  <Link
                    href="/settings/billing"
                    aria-label={`Current plan: ${billing.data.plan === "team" ? "Team" : "Free"}. View billing`}
                    className="bg-muted/70 border-line-strong hidden shrink-0 items-center gap-1 rounded-full border py-[3px] pr-[7px] pl-[5px] text-xs leading-none transition-colors hover:bg-muted sm:inline-flex"
                  >
                    <span className="bg-status size-1.5 rounded-full shadow-[0_0_0_2px_color-mix(in_oklab,var(--status)_25%,transparent)]" />
                    {billing.data.plan === "team" ? "Team" : "Free"}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {actions}
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Search or jump to"
                  aria-keyshortcuts="Meta+K Control+K"
                  onClick={() =>
                    window.dispatchEvent(
                      new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                    )
                  }
                >
                  <HugeiconsIcon icon={Search01Icon} size={14} aria-hidden />
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon-sm"
                  className="relative hidden sm:inline-flex"
                >
                  <Link
                    href="/inbox"
                    aria-label={
                      inbox.data ? `Inbox, ${inbox.data} unread` : "Inbox"
                    }
                  >
                    <RiNotification3Line aria-hidden />
                    {(inbox.data ?? 0) > 0 && (
                      <span className="bg-danger ring-background absolute top-[7px] right-[8px] size-[5px] rounded-full ring-2" />
                    )}
                  </Link>
                </Button>
                <div className="hidden sm:contents">
                  <ThemeToggle />
                </div>
                <NewIssueButton />
                <UserMenu />
              </div>
            </div>
            {inSettings ? (
              <div className="overflow-x-auto border-b px-4 md:px-5">
                <Tabs value={activeTab} onValueChange={(v) => router.push(v)}>
                  <TabList
                    variant="line"
                    aria-label="Settings"
                    className="h-11 min-w-max gap-5 p-0"
                  >
                    {tabs.map((t) => (
                      <Tab
                        key={t.value}
                        value={t.value}
                        className="h-full flex-none after:bottom-0!"
                      >
                        {t.label}
                      </Tab>
                    ))}
                  </TabList>
                </Tabs>
              </div>
            ) : (
              <div className="border-b" />
            )}
          </header>
          {(slots.hasFilters || slots.hasActions) && (
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-5">
              {slots.hasFilters && (
                <div ref={slots.setFilters} className="contents" />
              )}
              {slots.hasActions && (
                <div
                  ref={slots.setActions}
                  className="ml-auto flex items-center gap-1.5"
                />
              )}
            </div>
          )}
          <div
            className={cn(
              "animate-in fade-in slide-in-from-bottom-1 ease-power3-out flex w-full min-w-0 flex-col gap-6 px-4 py-6 duration-300 md:px-5 md:py-7",
              WIDTH[width],
            )}
          >
            {intro}
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ShellSlotsContext.Provider>
  );
}
