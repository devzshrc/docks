"use client"

import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useNewIssue } from "@/components/new-issue/provider"
import { DashboardButton } from "@/components/obsidian/dashboard-shell"

/** Header action (the shell's primary button); renders nothing for people who can't create issues. */
export function NewIssueButton() {
  const { open, canCreate } = useNewIssue()
  if (!canCreate) return null
  return (
    <DashboardButton variant="primary" onClick={() => open({ source: "board" })} className="gap-1.5">
      <HugeiconsIcon icon={PlusSignIcon} size={12} aria-hidden />
      New issue
      <kbd className="hidden rounded bg-white/20 px-1 text-[10px] sm:inline">C</kbd>
    </DashboardButton>
  )
}
