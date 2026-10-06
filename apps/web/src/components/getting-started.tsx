"use client"

import { IconCircleCheck, IconCircleDashed } from "@tabler/icons-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Step = { title: string; body: string; href: string; action: string; done: boolean }

/** Shown on /review until there's a board to show (plan.md §5.1). */
export function GettingStarted({
  hasWorkspace,
  hasRepos,
  hasEnabledRepo,
  hasGithubAccount,
}: {
  hasWorkspace: boolean
  hasRepos: boolean
  hasEnabledRepo: boolean
  hasGithubAccount: boolean
}) {
  const steps: Step[] = [
    {
      title: "Create a workspace",
      body: "Holds your team, repositories and billing.",
      href: "/settings/integrations",
      action: "Create workspace",
      done: hasWorkspace,
    },
    {
      title: "Install the GitHub App",
      body: "Pick the repositories whose pull requests you want on the board.",
      href: "/settings/integrations",
      action: "Connect GitHub",
      done: hasRepos,
    },
    {
      title: "Turn on a repository",
      body: "Free workspaces can track up to 3.",
      href: "/settings/repositories",
      action: "Choose repositories",
      done: hasEnabledRepo,
    },
    {
      title: "Connect your GitHub account",
      body: "You'll see the repositories you can access on GitHub, and reviews post as you.",
      href: "/settings/integrations",
      action: "Connect GitHub account",
      done: hasGithubAccount,
    },
  ]
  const next = steps.find((s) => !s.done)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Get your review board running</CardTitle>
        <CardDescription>A few steps, then open pull requests show up here automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3">
              {s.done ? (
                <IconCircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Done" />
              ) : (
                <IconCircleDashed className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-label="To do" />
              )}
              <div className="flex-1 space-y-1">
                <p className={s.done ? "text-muted-foreground text-sm line-through" : "text-sm font-medium"}>
                  {s.title}
                </p>
                {!s.done && <p className="text-muted-foreground text-sm">{s.body}</p>}
                {s === next && (
                  <Button asChild size="sm" className="mt-1">
                    <Link href={s.href}>{s.action}</Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
