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
  const { data: session, isPending, error, refetch } = useSession()
  // A failed session check (rate limit, network blip) is not a sign-out: keep the person here and retry.
  const failed = Boolean(error) && !session?.user

  React.useEffect(() => {
    if (!isPending && !error && !session?.user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [isPending, error, session, router])

  React.useEffect(() => {
    if (!failed) return
    const retry = window.setTimeout(() => void refetch(), 3000)
    return () => window.clearTimeout(retry)
  }, [failed, refetch])

  if (isPending || !session?.user) return <SessionWait failed={failed} />

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

  if (isPending || session?.user) return <SessionWait />

  return <>{children}</>
}

/** Quiet placeholder while the session resolves: no flashing text, only a note if it takes a while or fails. */
function SessionWait({ failed = false }: { failed?: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background" aria-busy="true">
      <p
        role="status"
        className="text-sm text-muted-foreground animate-in fade-in duration-300 [animation-delay:700ms] [animation-fill-mode:both]"
      >
        {failed ? "Reconnecting…" : "Loading your workspace…"}
      </p>
    </div>
  )
}
