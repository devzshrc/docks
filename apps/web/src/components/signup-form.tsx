"use client"

import Link from "next/link"
import * as React from "react"

import { GitHubSignIn } from "@/components/github-sign-in"
import { Button } from "@/components/ui/button"
import { nextPath } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

/** Keep ?next= when switching between login and signup (client-only, after hydration). */
function useWithNext(path: string) {
  const [href, setHref] = React.useState(path)
  React.useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next")
    if (next) setHref(`${path}?next=${encodeURIComponent(next)}`)
  }, [path])
  return href
}

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const altHref = useWithNext("/login")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    setError(null)
    setPending(true)
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: `${window.location.origin}${nextPath()}`,
    })
    setPending(false)
    if (error) {
      setError(error.message ?? "Sign-up failed")
      return
    }
    // Email verification is required, so there's no session yet.
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to {sentTo}. Open it to finish creating your account.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Enter your information below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Full Name</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldDescription>
                Must be at least 8 characters long.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm Password
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create Account"}
              </Button>
              {error && <FieldError>{error}</FieldError>}
              <GitHubSignIn />
              <FieldDescription className="px-6 text-center">
                Already have an account?{" "}
                <Link href={altHref} className="underline underline-offset-4">
                  Sign in
                </Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
