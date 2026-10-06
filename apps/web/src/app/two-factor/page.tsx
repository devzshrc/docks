"use client"

import { useState } from "react"

import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { nextPath } from "@/lib/utils"

/** Second step of sign-in when the account has 2FA on. */
export default function Page() {
  const [code, setCode] = useState("")
  const [backup, setBackup] = useState(false)
  const [trust, setTrust] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  return (
    <AuthCard
      title="Two-factor authentication"
      description={backup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          setError(undefined)
          const { error } = backup
            ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: trust })
            : await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: trust })
          setPending(false)
          if (error) setError(error.message ?? "That code didn't work. Try again.")
          else window.location.href = nextPath()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="code">{backup ? "Backup code" : "Code"}</Label>
          <Input
            id="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          Trust this device for 30 days
        </label>
        <Button type="submit" className="w-full" disabled={pending}>
          Verify
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <button
          type="button"
          className="block w-full text-center text-sm underline underline-offset-4"
          onClick={() => {
            setBackup((b) => !b)
            setCode("")
            setError(undefined)
          }}
        >
          {backup ? "Use your authenticator app" : "Use a backup code"}
        </button>
      </form>
    </AuthCard>
  )
}
