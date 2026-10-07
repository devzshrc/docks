import { AppSidebar } from "@/components/app-sidebar"
import { NewIssueProvider } from "@/components/new-issue/provider"
import { CommandPalette } from "@/components/command-palette"
import { RequireAuth } from "@/components/auth-guard"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const WIDTH = {
  narrow: "max-w-[720px]", // settings and forms
  default: "max-w-[1040px]",
  wide: "max-w-[1360px]", // board and code review
} as const

/**
 * Authenticated page chrome. Every page gets the same header (title, one-line
 * description, optional actions) and the same spacing rhythm.
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
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 60)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0">
          <SiteHeader />
          <div className={cn("animate-in fade-in slide-in-from-bottom-1 mx-auto flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6 duration-200 md:px-6 lg:px-8 lg:py-8", WIDTH[width])}>
            {title && (
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <h1 className="text-xl font-medium tracking-tight">{title}</h1>
                  {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
              </header>
            )}
            {children}
          </div>
          <CommandPalette />
        </SidebarInset>
      </SidebarProvider>
      </NewIssueProvider>
    </RequireAuth>
  )
}
