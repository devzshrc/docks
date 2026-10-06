"use client"

import { useQuery } from "@tanstack/react-query"
import { IconBrandGithub } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { nextPath } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

/** "Continue with GitHub", shown only when the server has GitHub sign-in configured. */
export function GitHubSignIn() {
  const trpc = useTRPC()
  const config = useQuery(trpc.health.authConfig.queryOptions())
  const [error, setError] = useState<string>()
  if (!config.data?.githubLogin) return null

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={async () => {
          setError(undefined)
          const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: `${window.location.origin}${nextPath()}`,
          })
          if (error) setError(error.message ?? "GitHub sign-in failed")
        }}
      >
        <IconBrandGithub className="size-4" aria-hidden />
        Continue with GitHub
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </>
  )
}
