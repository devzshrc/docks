"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { NewIssuePanel } from "@/components/new-issue/panel"
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace"

export type IssueSource = "board" | "palette" | "shortcut" | "link" | "comment"

/** Starting content, e.g. from a review comment. */
export interface IssueSeed {
  title: string
  body: string
}

interface Ctx {
  /** Opens the panel; `repo` preselects a repository (owner/name). */
  open: (opts?: { repo?: string; source?: IssueSource; seed?: IssueSeed }) => void
  /** Viewers can't create issues, so they get no entry points. */
  canCreate: boolean
}

const NewIssueContext = createContext<Ctx>({ open: () => {}, canCreate: false })
export const useNewIssue = () => useContext(NewIssueContext)

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))

/** Mounts the "New issue" panel once per page and owns its entry points: `c`, ?new-issue=1, and the open() callback. */
export function NewIssueProvider({ children }: { children: React.ReactNode }) {
  const { workspace } = useWorkspace()
  const settings = useWorkspaceSettings(workspace?.id)
  const canCreate = Boolean(workspace && settings.data?.can["review.act"])
  const [state, setState] = useState<{ open: boolean; repo?: string; source: IssueSource; seed?: IssueSeed; nonce: number }>({ open: false, source: "board", nonce: 0 })

  const open = useCallback((o?: { repo?: string; source?: IssueSource; seed?: IssueSeed }) => {
    setState((s) => ({ open: true, repo: o?.repo, source: o?.source ?? "board", seed: o?.seed, nonce: s.nonce + 1 }))
  }, [])

  useEffect(() => {
    if (!canCreate) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      if (document.querySelector("dialog[open], [role=dialog]")) return
      e.preventDefault()
      open({ source: "shortcut" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canCreate, open])

  // Deep link: /review?new-issue=1&repo=owner/name
  useEffect(() => {
    if (!canCreate) return
    const params = new URLSearchParams(window.location.search)
    if (params.get("new-issue") !== "1") return
    open({ repo: params.get("repo") ?? undefined, source: "link" })
    params.delete("new-issue")
    params.delete("repo")
    const rest = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`)
  }, [canCreate, open])

  const value = useMemo(() => ({ open, canCreate }), [open, canCreate])
  return (
    <NewIssueContext.Provider value={value}>
      {children}
      {canCreate && workspace && (
        <NewIssuePanel
          workspaceId={workspace.id}
          open={state.open}
          wantedRepo={state.repo}
          source={state.source}
          seed={state.seed}
          nonce={state.nonce}
          onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
        />
      )}
    </NewIssueContext.Provider>
  )
}
