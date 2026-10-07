"use client"

import Link from "next/link"
import * as React from "react"
import {
  IconChartBar,
  IconCreditCard,
  IconFolders,
  IconGitPullRequest,
  IconPlugConnected,
  IconUserCircle,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { useSession } from "@/lib/auth-client"

const navReview = [
  { title: "Reviews", url: "/review", icon: IconGitPullRequest },
  { title: "Insights", url: "/insights", icon: IconChartBar },
  { title: "Team", url: "/team", icon: IconUsersGroup },
]

const navSettings = [
  { title: "Repositories", url: "/settings/repositories", icon: IconFolders },
  { title: "Integrations", url: "/settings/integrations", icon: IconPlugConnected },
  { title: "Workspace", url: "/settings/workspace", icon: IconUsers },
  { title: "Billing", url: "/settings/billing", icon: IconCreditCard },
  { title: "Account", url: "/settings/account", icon: IconUserCircle },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()
  const user = session?.user

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="h-12 justify-center border-b border-hairline px-3 py-0">
        <Link href="/review" className="flex h-8 items-center gap-2.5 rounded-lg px-1 text-sm font-medium">
          <span className="bg-foreground text-background flex size-6 items-center justify-center rounded-md text-xs font-medium" aria-hidden>
            D
          </span>
          Docks
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Review" items={navReview} />
        <NavMain label="Settings" items={navSettings} />
      </SidebarContent>
      <SidebarFooter>
        {user && (
          <NavUser
            user={{
              name: user.name,
              email: user.email,
              avatar: user.image ?? "",
            }}
          />
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
