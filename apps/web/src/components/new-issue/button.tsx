"use client"

import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useNewIssue } from "@/components/new-issue/provider"
import { Button } from "@/components/ui/button"

/** Header action (the shell's primary button); renders nothing for people who can't create issues. */
export function NewIssueButton() {
  const { open, canCreate } = useNewIssue()
  if (!canCreate) return null
  return (
    <Button variant="default" size="sm" onClick={() => open({ source: "board" })}>
      <HugeiconsIcon icon={PlusSignIcon} size={12} aria-hidden />
      New issue
      <kbd className="hidden rounded-[4px] bg-white/15 px-1 py-0.5 text-[10px] leading-none sm:inline">C</kbd>
    </Button>
  )
}
