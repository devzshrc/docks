"use client"

import { IconSearch } from "@tabler/icons-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"

/** Slim top bar: sidebar toggle, search (opens ⌘K), theme. Page titles live in the page. */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="text-muted-foreground hover:bg-muted ml-2 flex h-8 w-full max-w-xs items-center gap-2 rounded-md border px-2.5 text-sm transition-colors"
      >
        <IconSearch className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="bg-muted rounded px-1.5 font-mono text-[11px]">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  )
}
