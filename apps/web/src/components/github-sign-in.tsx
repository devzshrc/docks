"use client"

import { useQuery } from "@tanstack/react-query"
import { IconBrandGithub } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { nextPath } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

/** What to tell people when GitHub sends them back with an error code. */
const ERRORS: Record<string, string> = {
  access_denied: "GitHub sign-in was cancelled.",
  email_not_found: "GitHub didn't share an email address. Add a verified email to your GitHub account and try again.",
  account_not_linked: "That email already has a Docks account. Sign in with your password, then connect GitHub in Settings.",
  unable_to_get_user_info: "We couldn't read your GitHub profile. Try again.",
  state_mismatch: "That sign-in link expired. Try again.",
}

export function githubErrorMessage(code: string | null) {
  if (!code) return undefined
  return ERRORS[code] ?? "Couldn't sign in with GitHub. Try again."
}

/**
 * "Continue with GitHub" is the primary way in: one click, no password, and the GitHub account is connected for
 * reviewing and merging as yourself. Always shown; says so plainly if the server hasn't been set up for it.
 */
export function GitHubSignIn({ label = "Continue with GitHub" }: { label?: string }) {
  const trpc = useTRPC()
  const config = useQuery(trpc.health.authConfig.queryOptions())
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  // Errors come back as /login?error=<code>.
  useEffect(() => {
    setError(githubErrorMessage(new URLSearchParams(window.location.search).get("error")))
  }, [])

  const unavailable = config.data ? !config.data.githubLogin : false
  // Without GitHub sign-in on this installation, offer only what works: the email form.
  if (unavailable && !error) return null

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="lg"
        type="button"
        className="h-10 w-full"
        pending={pending}
        disabled={unavailable}
        onClick={async () => {
          setError(undefined)
          setPending(true)
          const origin = window.location.origin
          const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: `${origin}${nextPath()}`,
            errorCallbackURL: `${origin}/login`,
            newUserCallbackURL: `${origin}/review`,
          })
          // On success the browser is already on its way to GitHub; only a failure lands here.
          if (error) {
            setPending(false)
            setError(error.message ?? "GitHub sign-in failed")
          }
        }}
      >
        <IconBrandGithub className="size-4" aria-hidden />
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-center text-sm">
          {error}
        </p>
      )}
      <div className="text-text-3 flex items-center gap-3 text-xs" aria-hidden>
        <span className="bg-hairline h-px flex-1" />
        or with email
        <span className="bg-hairline h-px flex-1" />
      </div>
    </div>
  )
}
