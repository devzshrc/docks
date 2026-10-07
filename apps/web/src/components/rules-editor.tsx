"use client"

import type { RoutingRule } from "@docks/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { toast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useTRPC } from "@/trpc/react"

/** zod failures arrive as a JSON array of issues; show just their messages. */
function readable(message: string) {
  try {
    const issues = JSON.parse(message) as { message?: string }[]
    return [...new Set(issues.map((i) => i.message).filter(Boolean))].join(". ")
  } catch {
    return message
  }
}

const blank = (): RoutingRule => ({ id: crypto.randomUUID().slice(0, 8), paths: [], minLines: null, label: null, teamId: null, reviewers: [], comment: null })
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)
const field = "text-muted-foreground mb-1 block text-xs font-medium"

function RuleCard({ rule, teams, onChange, onRemove, index }: {
  rule: RoutingRule
  teams: { id: string; name: string }[]
  onChange: (patch: Partial<RoutingRule>) => void
  onRemove: () => void
  index: number
}) {
  const set = onChange
  return (
    <fieldset className="animate-in fade-in slide-in-from-bottom-1 space-y-4 rounded-xl border p-4 duration-200">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium">Rule {index + 1}</legend>
        <Button type="button" size="xs" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium">When</p>
        <div>
          <label className={field} htmlFor={`paths-${rule.id}`}>Changed files match</label>
          <Input id={`paths-${rule.id}`} placeholder="billing/, **/*.sql, infra/**" defaultValue={rule.paths.join(", ")} onBlur={(e) => set({ paths: list(e.target.value) })} />
        </div>
        <div>
          <label className={field} htmlFor={`lines-${rule.id}`}>and/or the PR changes at least (lines)</label>
          <Input
            id={`lines-${rule.id}`}
            type="number"
            min={1}
            className="w-40"
            placeholder="800"
            defaultValue={rule.minLines ?? ""}
            onBlur={(e) => set({ minLines: e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null })}
          />
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium">Then</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={field} htmlFor={`label-${rule.id}`}>Add label</label>
            <Input id={`label-${rule.id}`} placeholder="billing" defaultValue={rule.label ?? ""} onBlur={(e) => set({ label: e.target.value.trim() || null })} />
          </div>
          <div>
            <label className={field} htmlFor={`team-${rule.id}`}>Request team</label>
            <select
              id={`team-${rule.id}`}
              className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
              value={rule.teamId ?? ""}
              onChange={(e) => set({ teamId: e.target.value || null })}
            >
              <option value="">None</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={field} htmlFor={`people-${rule.id}`}>Request people (GitHub usernames)</label>
          <Input id={`people-${rule.id}`} placeholder="octocat, hubot" defaultValue={rule.reviewers.join(", ")} onBlur={(e) => set({ reviewers: list(e.target.value) })} />
        </div>
        <div>
          <label className={field} htmlFor={`comment-${rule.id}`}>Post a comment</label>
          <textarea
            id={`comment-${rule.id}`}
            rows={2}
            className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="This PR is large. Could it be split into smaller ones?"
            defaultValue={rule.comment ?? ""}
            onBlur={(e) => set({ comment: e.target.value.trim() || null })}
          />
        </div>
      </div>
    </fieldset>
  )
}

/** Per-repo routing rules: "when files / size match, label, request people or a team, comment". */
export function RulesEditor({ workspaceId, repo }: { workspaceId: string; repo: { id: number; fullName: string; routingRules: RoutingRule[] } }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<RoutingRule[]>(repo.routingRules)
  const teams = useQuery({ ...trpc.people.teams.queryOptions({ workspaceId }), enabled: open })
  const save = useMutation(
    trpc.workspace.setRepo.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.workspace.repos.queryFilter())
        setOpen(false)
        toast("Rules saved")
      },
    })
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setRules(repo.routingRules)
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          {repo.routingRules.length ? `${repo.routingRules.length} rule${repo.routingRules.length > 1 ? "s" : ""}` : "Add rules"}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Routing rules</SheetTitle>
          <SheetDescription>
            {repo.fullName}: when a pull request matches, Docks labels it, requests reviewers or comments as the GitHub App. Each rule runs once per PR.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {rules.length === 0 && (
            <p className="text-muted-foreground rounded-lg bg-muted/50 p-4 text-sm">
              Examples: touches <code className="font-code">billing/</code> → label &ldquo;billing&rdquo; and request the payments team. Over 800 lines → comment asking to split.
            </p>
          )}
          {rules.map((r, i) => (
            <RuleCard
              key={r.id}
              rule={r}
              index={i}
              teams={teams.data ?? []}
              onChange={(patch) => setRules((all) => all.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
              onRemove={() => setRules((all) => all.filter((x) => x.id !== r.id))}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRules((all) => [...all, blank()])} disabled={rules.length >= 20}>
              Add rule
            </Button>
            <Button type="button" size="sm" pending={save.isPending} onClick={() => save.mutate({ repoId: repo.id, routingRules: rules })}>
              Save rules
            </Button>
            {save.error && <span role="alert" className="text-destructive text-sm">{readable(save.error.message)}</span>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
