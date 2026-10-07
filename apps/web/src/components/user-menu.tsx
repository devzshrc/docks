"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"

import { DashboardMenu, DashboardMenuContent, DashboardMenuItem, DashboardMenuLabel, DashboardMenuSeparator, DashboardMenuTrigger } from "@/components/obsidian/dashboard-shell"
import { PersonAvatar } from "@/components/person-avatar"
import { authClient, useSession } from "@/lib/auth-client"

/** The signed-in person, pinned to the bottom of the sidebar. Opens a menu with Account and Sign out. */
export function UserMenu() {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user
  if (!user) return null

  return (
    <DashboardMenu>
      <DashboardMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-hover flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <PersonAvatar seed={user.id} name={user.name} src={user.image} className="size-8" />
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">{user.email}</span>
          </span>
        </button>
      </DashboardMenuTrigger>
      <DashboardMenuContent side="top" align="start" className="w-56">
        <DashboardMenuLabel>Signed in as {user.name}</DashboardMenuLabel>
        <DashboardMenuItem asChild>
          <Link href="/settings/account">Account and security</Link>
        </DashboardMenuItem>
        <DashboardMenuSeparator />
        <DashboardMenuItem
          onSelect={async () => {
            await authClient.signOut()
            router.push("/login")
            router.refresh()
          }}
        >
          Sign out
        </DashboardMenuItem>
      </DashboardMenuContent>
    </DashboardMenu>
  )
}
