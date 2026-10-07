"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

import { authClient } from "@/lib/auth-client"
import { useTRPC } from "@/trpc/react"

/**
 * One click to start: GitHub sign-in when the server has it, otherwise the sign-up page.
 * Used by every call to action on the landing page.
 */
export function useGithubStart() {
  const trpc = useTRPC()
  const router = useRouter()
  const config = useQuery(trpc.health.authConfig.queryOptions())
  const [pending, setPending] = useState(false)

  const start = useCallback(async () => {
    if (!config.data?.githubLogin) {
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
      router.push("/login")
    }
  }, [config.data?.githubLogin, router])

  return { start, pending }
}
