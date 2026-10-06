"use client"

import Link from "next/link"
import { useState } from "react"

import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        description={`If an account exists for ${email}, we sent a link to reset its password. It works for one hour.`}
      >
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to login
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Reset your password" description="Enter your account's email and we'll send you a reset link.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          setError(undefined)
          const { error } = await authClient.requestPasswordReset({
            email,
            redirectTo: `${window.location.origin}/reset-password`,
          })
          setPending(false)
          // Same message whether or not the account exists.
          if (error && error.status !== 404) setError(error.message ?? "Couldn't send the email. Try again.")
          else setSent(true)
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          Send reset link
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Link href="/login" className="block text-center text-sm underline underline-offset-4">
          Back to login
        </Link>
      </form>
    </AuthCard>
  )
}
