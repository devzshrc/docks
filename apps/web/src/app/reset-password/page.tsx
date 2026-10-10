"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

function ResetForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  if (!token || params.get("error")) {
    return (
      <AuthCard title="Link expired" description="This reset link is invalid or has expired.">
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          Send a new link
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Choose a new password">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (password !== confirm) {
            setError("Passwords don't match")
            return
          }
          setPending(true)
          setError(undefined)
          const { error } = await authClient.resetPassword({ newPassword: password, token })
          setPending(false)
          if (error) setError(error.message ?? "Couldn't reset the password. Request a new link.")
          else router.push(params.get("next") === "/settings/account" ? "/login?next=%2Fsettings%2Faccount" : "/login")
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          Reset password
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </form>
    </AuthCard>
  )
}

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
