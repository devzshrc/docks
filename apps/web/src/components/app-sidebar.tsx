"use client"

import Link from "next/link"
import * as React from "react"
import {
  IconCreditCard,
  IconFolders,
  IconGitPullRequest,
  IconInnerShadowTop,
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useSession } from "@/lib/auth-client"

const navMain = [
  {
    title: "Reviews",
    url: "/review",
    icon: IconGitPullRequest,
  },
  {
    title: "Team",
    url: "/team",
    icon: IconUsersGroup,
  },
  {
    title: "Repositories",
    url: "/settings/repositories",
    icon: IconFolders,
  },
  {
    title: "Integrations",
    url: "/settings/integrations",
    icon: IconPlugConnected,
  },
  {
    title: "Workspace",
    url: "/settings/workspace",
    icon: IconUsers,
  },
  {
    title: "Billing",
    url: "/settings/billing",
    icon: IconCreditCard,
  },
  {
    title: "Account",
    url: "/settings/account",
    icon: IconUserCircle,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()
  const user = session?.user

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/review">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">Docks</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
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
