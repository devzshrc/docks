"use client"

import QRCode from "qrcode"
import { useEffect, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient, useSession } from "@/lib/auth-client"

function Status({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (ok) return <p className="text-sm text-emerald-600">{ok}</p>
  return null
}

function ProfileCard() {
  const { data: session, refetch } = useSession()
  const [name, setName] = useState("")
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  useEffect(() => setName(session?.user.name ?? ""), [session?.user.name])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>{session?.user.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const { error } = await authClient.updateUser({ name: name.trim() })
            setMsg(error ? { error: error.message } : { ok: "Saved" })
            refetch()
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" required />
          <Button type="submit" variant="outline">
            Save
          </Button>
        </form>
        <Status {...msg} />
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="max-w-md space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const { error } = await authClient.changePassword({
              currentPassword: current,
              newPassword: next,
              revokeOtherSessions: true,
            })
            setMsg(error ? { error: error.message } : { ok: "Password changed" })
            if (!error) {
              setCurrent("")
              setNext("")
            }
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <Button type="submit" variant="outline">
            Change password
          </Button>
          <Status {...msg} />
        </form>
      </CardContent>
    </Card>
  )
}

function TwoFactorCard() {
  const { data: session, refetch } = useSession()
  const enabled = Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled)
  const [password, setPassword] = useState("")
  const [setup, setSetup] = useState<{ qr: string; secret: string; backupCodes: string[] } | null>(null)
  const [code, setCode] = useState("")
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})

  async function start(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await authClient.twoFactor.enable({ password })
    if (error || !data || data.method !== "totp") return setMsg({ error: error?.message ?? "Couldn't start setup" })
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? ""
    setSetup({ qr: await QRCode.toDataURL(data.totpURI), secret, backupCodes: data.backupCodes })
    setPassword("")
    setMsg({})
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() })
    if (error) return setMsg({ error: error.message ?? "That code didn't work" })
    setMsg({ ok: "Two-factor authentication is on" })
    setCode("")
    refetch()
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await authClient.twoFactor.disable({ password })
    setMsg(error ? { error: error.message } : { ok: "Two-factor authentication is off" })
    setPassword("")
    setSetup(null)
    refetch()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication {enabled && <Badge>On</Badge>}
        </CardTitle>
        <CardDescription>Ask for a code from an authenticator app when you sign in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {setup && !enabled ? (
          <form className="max-w-md space-y-3" onSubmit={confirm}>
            <p className="text-sm">Scan this with your authenticator app, then enter the code it shows.</p>
            <img src={setup.qr} alt="QR code for your authenticator app" className="size-40 rounded bg-white p-2" />
            <p className="text-muted-foreground text-xs">
              Can&apos;t scan? Enter this key: <code className="break-all">{setup.secret}</code>
            </p>
            <div className="space-y-1">
              <p className="text-sm font-medium">Backup codes</p>
              <p className="text-muted-foreground text-xs">Save these somewhere safe. Each works once if you lose your device.</p>
              <pre className="bg-muted rounded p-2 text-xs">{setup.backupCodes.join("\n")}</pre>
            </div>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                aria-label="Authenticator code"
                required
              />
              <Button type="submit">Turn on</Button>
            </div>
          </form>
        ) : (
          <form className="flex max-w-md gap-2" onSubmit={enabled ? disable : start}>
            <Input
              type="password"
              placeholder="Your password"
              aria-label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant={enabled ? "outline" : "default"}>
              {enabled ? "Turn off" : "Set up"}
            </Button>
          </form>
        )}
        <Status {...msg} />
      </CardContent>
    </Card>
  )
}

type SessionRow = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date }

function SessionsCard() {
  const { data: current } = useSession()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})

  async function load() {
    const { data } = await authClient.listSessions()
    setSessions((data ?? []) as SessionRow[])
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Devices signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-md border text-sm">
          {sessions.map((s) => {
            const mine = s.token === current?.session.token
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{s.userAgent ?? "Unknown device"}</span>
                  <span className="text-muted-foreground text-xs">
                    {s.ipAddress ?? "unknown IP"} · since {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </span>
                {mine ? (
                  <Badge variant="outline">This device</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await authClient.revokeSession({ token: s.token })
                      void load()
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {sessions.length > 1 && (
          <Button
            variant="outline"
            onClick={async () => {
              const { error } = await authClient.revokeOtherSessions()
              setMsg(error ? { error: error.message } : { ok: "Signed out of all other devices" })
              void load()
            }}
          >
            Sign out of all other devices
          </Button>
        )}
        <Status {...msg} />
      </CardContent>
    </Card>
  )
}

function DeleteAccountCard() {
  const [password, setPassword] = useState("")
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Removes your account and your memberships. Workspaces you own must have another owner first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!confirm("Delete your account permanently?")) return
            const { error } = await authClient.deleteUser({ password, callbackURL: "/login" })
            if (error) setMsg({ error: error.message })
            else window.location.href = "/login"
          }}
        >
          <Input
            type="password"
            placeholder="Your password"
            aria-label="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="destructive">
            Delete account
          </Button>
        </form>
        <Status {...msg} />
      </CardContent>
    </Card>
  )
}

export default function Page() {
  return (
    <AppShell title="Account">
      <div className="flex max-w-2xl flex-col gap-4">
        <ProfileCard />
        <PasswordCard />
        <TwoFactorCard />
        <SessionsCard />
        <DeleteAccountCard />
      </div>
    </AppShell>
  )
}
