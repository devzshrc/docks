"use client"

import { usePathname } from "next/navigation"

import { SettingsTabs } from "@/components/settings-tabs"

/**
 * Title, description and actions for a page. Inside /settings the page is always "Settings" with tabs,
 * and the page's own title becomes the section heading below them, so the structure never changes.
 */
export function PageHeader({ title, description, actions }: { title?: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  const inSettings = usePathname().startsWith("/settings")

  if (inSettings) {
    return (
      <>
        <header className="space-y-1">
          <h1 className="text-xl font-medium tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your workspace, integrations and account.</p>
        </header>
        <SettingsTabs />
        {(title || actions) && (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              {title && <h2 className="text-base font-medium tracking-tight">{title}</h2>}
              {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        )}
      </>
    )
  }

  if (!title) return null
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
