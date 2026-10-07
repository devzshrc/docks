"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

import { authClient } from "@/lib/auth-client"
import { useTRPC } from "@/trpc/react"

/**
 * One click to start: GitHub sign-in when the server has it, otherwise the sign-up page.
 * Used by every call to action on the landing page.
 * Surfaces a notice instead of silently redirecting when GitHub login is
 * unavailable or fails, so the landing page can explain the fallback.
 */
export function useGithubStart() {
  const trpc = useTRPC()
  const router = useRouter()
  const config = useQuery(trpc.health.authConfig.queryOptions())
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const start = useCallback(async () => {
    setNotice(null)
    if (config.isLoading) return
    if (!config.data?.githubLogin) {
      setNotice("GitHub login isn't enabled on this server — continue with email instead.")
      router.push("/signup")
      return
    }
    setPending(true)
    const origin = window.location.origin
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: `${origin}/review`,
      errorCallbackURL: `${origin}/login`,
      newUserCallbackURL: `${origin}/review`,
    })
    if (error) {
      setPending(false)
      setNotice("GitHub didn't complete the sign-in. Try again, or use email instead.")
      router.push("/login")
    }
  }, [config.data?.githubLogin, config.isLoading, router])

  return { start, pending, notice }
}
