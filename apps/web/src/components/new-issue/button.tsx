"use client"

import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useNewIssue } from "@/components/new-issue/provider"
import { Button } from "@/components/ui/button"

/** Header action; renders nothing for people who can't create issues. */
export function NewIssueButton() {
  const { open, canCreate } = useNewIssue()
  if (!canCreate) return null
  return (
    <Button size="sm" onClick={() => open({ source: "board" })}>
      <HugeiconsIcon icon={PlusSignIcon} size={15} aria-hidden />
      New issue
      <kbd className="ml-0.5 hidden rounded bg-white/20 px-1 text-[10px] sm:inline">C</kbd>
    </Button>
  )
}
