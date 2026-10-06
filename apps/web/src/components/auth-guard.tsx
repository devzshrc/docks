"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { useSession } from "@/lib/auth-client"
import { nextPath } from "@/lib/utils"

/**
 * Gate for protected routes (e.g. /dashboard).
 * The session cookie lives on the API origin, so the check runs client-side.
 * Renders nothing until the session resolves to avoid flashing protected UI.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  React.useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [isPending, session, router])

  if (isPending || !session?.user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * Gate for public-only routes (e.g. /login, /signup).
 * Signed-in users land straight on the dashboard.
 */
export function RedirectIfAuthed({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  React.useEffect(() => {
    if (!isPending && session?.user) {
      router.replace(nextPath())
    }
  }, [isPending, session, router])

  if (isPending || session?.user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return <>{children}</>
}
