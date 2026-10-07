"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconBrandGithub } from "@tabler/icons-react"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

const GITHUB_STATUS: Record<string, string> = {
  connected: "GitHub connected. Repositories are syncing in the background.",
  failed: "Couldn't link the GitHub installation. Try again.",
  "signed-out": "Your session expired. Sign in and install again.",
  invalid: "GitHub sent an incomplete response. Try again.",
}

function CreateWorkspace() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const create = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
    })
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>A workspace holds your team, repositories and billing.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate({ name })
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme engineering"
            aria-label="Workspace name"
          />
          <Button type="submit" disabled={create.isPending}>
            Create workspace
          </Button>
        </form>
        {create.error && (
          <p className="text-destructive mt-2 text-sm">{create.error.message}</p>
        )}
      </CardContent>
    </Card>
  )
}

function GitHubCard({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const params = useSearchParams()
  const status = params.get("github")
  const install = useQuery(trpc.integration.githubInstallUrl.queryOptions({ workspaceId }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBrandGithub className="size-5" aria-hidden />
          GitHub
        </CardTitle>
        <CardDescription>
          Install the GitHub App on your organization and choose which repositories to include.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && GITHUB_STATUS[status] && (
          <p className={status === "connected" ? "text-sm" : "text-destructive text-sm"}>
            {GITHUB_STATUS[status]}
          </p>
        )}
        {install.error ? (
          <p className="text-destructive text-sm">{install.error.message}</p>
        ) : (
          <Button asChild disabled={!install.data}>
            <a href={install.data?.url}>Install GitHub App</a>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

const ACCOUNT_STATUS: Record<string, string> = {
  connected: "GitHub account connected.",
  failed: "Couldn't connect your GitHub account. Try again.",
  "signed-out": "Your session expired. Sign in and connect again.",
  invalid: "GitHub sent an incomplete response. Try again.",
}

function GitHubAccountCard() {
  const trpc = useTRPC()
  const params = useSearchParams()
  const status = params.get("account")
  const account = useQuery(trpc.integration.githubAccount.queryOptions())

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your GitHub account</CardTitle>
        <CardDescription>
          Reviews and merges you make here are posted to GitHub as you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && ACCOUNT_STATUS[status] && (
          <p className={status === "connected" ? "text-sm" : "text-destructive text-sm"}>
            {ACCOUNT_STATUS[status]}
          </p>
        )}
        {account.data?.login && (
          <p className="text-sm">
            Connected as <span className="font-medium">{account.data.login}</span>
          </p>
        )}
        {account.data &&
          (account.data.connectUrl ? (
            <Button asChild variant={account.data.login ? "outline" : "default"}>
              <a href={account.data.connectUrl}>
                {account.data.login ? "Reconnect GitHub" : "Connect GitHub account"}
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              GitHub sign-in isn't configured on the server yet.
            </p>
          ))}
      </CardContent>
    </Card>
  )
}

const SLACK_STATUS: Record<string, string> = {
  connected: "Slack connected.",
  cancelled: "Slack connection cancelled.",
  failed: "Couldn't connect Slack. Try again.",
  "signed-out": "Your session expired. Sign in and connect again.",
  invalid: "Slack sent an incomplete response. Try again.",
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const formatHour = (h: number) =>
  new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

function SlackCard({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useSearchParams()
  const status = params.get("slack")
  const slack = useQuery(trpc.integration.slack.queryOptions({ workspaceId }))
  const refresh = () => queryClient.invalidateQueries(trpc.integration.slack.queryFilter())
  const setDigest = useMutation(trpc.integration.setDigest.mutationOptions({ onSuccess: refresh }))
  const test = useMutation(trpc.integration.sendTestDigest.mutationOptions())
  const disconnect = useMutation(trpc.integration.disconnectSlack.mutationOptions({ onSuccess: refresh }))
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const error = setDigest.error ?? test.error ?? disconnect.error

  if (slack.isPending) return <Skeleton className="h-32 w-full max-w-lg" />
  if (slack.error) return <p className="text-destructive text-sm">{slack.error.message}</p>
  const { connection, connectUrl, canManage } = slack.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slack</CardTitle>
        <CardDescription>A daily message listing PRs waiting more than 24h, and who they&apos;re waiting on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && SLACK_STATUS[status] && (
          <p className={status === "connected" ? "text-sm" : "text-destructive text-sm"}>{SLACK_STATUS[status]}</p>
        )}
        {connection ? (
          <>
            <p className="text-sm">
              Posting to <span className="font-medium">#{connection.channelName}</span> in {connection.teamName}
            </p>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="digest-hour">Send at</label>
                <select
                  id="digest-hour"
                  className="border-input bg-background h-9 rounded-lg border px-2"
                  value={connection.digestHour}
                  onChange={(e) =>
                    setDigest.mutate({ workspaceId, hour: Number(e.target.value), timezone: connection.timezone })
                  }
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground">{connection.timezone}</span>
                {connection.timezone !== browserTz && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDigest.mutate({ workspaceId, hour: connection.digestHour, timezone: browserTz })}
                  >
                    Use {browserTz}
                  </Button>
                )}
              </div>
            )}
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate({ workspaceId })}>
                  Send a test message
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disconnect.isPending}
                  onClick={() => confirm("Stop the Slack digest?") && disconnect.mutate({ workspaceId })}
                >
                  Disconnect
                </Button>
              </div>
            )}
            {test.isSuccess && <p className="text-sm">Test message sent.</p>}
          </>
        ) : canManage ? (
          connectUrl ? (
            <Button asChild>
              <a href={connectUrl}>Add to Slack</a>
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">Slack isn&apos;t configured on the server yet.</p>
          )
        ) : (
          <p className="text-muted-foreground text-sm">Ask a workspace owner to connect Slack.</p>
        )}
        {error && <p className="text-destructive text-sm">{error.message}</p>}
      </CardContent>
    </Card>
  )
}

function Integrations() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) return <CreateWorkspace />
  return (
    <Suspense>
      <div className="flex flex-col gap-4">
        <GitHubCard workspaceId={workspace.id} />
        <GitHubAccountCard />
        <SlackCard workspaceId={workspace.id} />
      </div>
    </Suspense>
  )
}

export default function Page() {
  return (
    <AppShell title="Integrations" description="Connect GitHub to sync pull requests, and Slack for the daily digest." width="narrow">
      <Integrations />
    </AppShell>
  )
}
