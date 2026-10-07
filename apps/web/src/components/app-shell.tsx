import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { RequireAuth } from "@/components/auth-guard"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/** Authenticated page chrome: sidebar, header, padded content. */
export function AppShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <RequireAuth>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader title={title} />
          <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">{children}</div>
          <CommandPalette />
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  )
}
