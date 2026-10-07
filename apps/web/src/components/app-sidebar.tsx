"use client"

import Link from "next/link"
import * as React from "react"
import {
  IconChartBar,
  IconGitPullRequest,
  IconSettings,
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

/** One entry; the tabs inside the Settings page hold everything else. */
const navSettings = [{ title: "Settings", url: "/settings/workspace", match: "/settings", icon: IconSettings }]

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
      </SidebarContent>
      <SidebarFooter>
        <NavMain items={navSettings} />
        {user && (
          <NavUser
            user={{
              id: user.id,
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
