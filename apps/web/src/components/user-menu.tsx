"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PersonAvatar } from "@/components/person-avatar"
import { authClient, useSession } from "@/lib/auth-client"

/** The signed-in person, pinned to the bottom of the sidebar. Opens a menu with Account and Sign out. */
export function UserMenu() {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user
  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>Signed in as {user.name}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings/account">Account and security</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut()
            router.push("/login")
            router.refresh()
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
