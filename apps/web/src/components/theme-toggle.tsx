"use client"

import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import {
  DashboardButton,
  DashboardMenu,
  DashboardMenuContent,
  DashboardMenuRadioGroup,
  DashboardMenuRadioItem,
  DashboardMenuTrigger,
} from "@/components/obsidian/dashboard-shell"

/** One icon button; the menu offers Light, Dark and System, and colours cross-fade when it changes. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === "dark"

  function choose(value: string) {
    const el = document.documentElement
    el.classList.add("theme-fade")
    setTheme(value)
    setTimeout(() => el.classList.remove("theme-fade"), 320)
  }

  return (
    <DashboardMenu>
      <DashboardMenuTrigger asChild>
        <DashboardButton variant="secondary" size="icon" aria-label="Color theme">
          <HugeiconsIcon key={String(dark)} icon={dark ? Moon02Icon : Sun03Icon} size={16} className="animate-in spin-in-45 zoom-in-50 fade-in duration-300" />
        </DashboardButton>
      </DashboardMenuTrigger>
      <DashboardMenuContent align="end" className="w-36">
        <DashboardMenuRadioGroup value={mounted ? (theme ?? "system") : "system"} onValueChange={choose}>
          <DashboardMenuRadioItem value="light">Light</DashboardMenuRadioItem>
          <DashboardMenuRadioItem value="dark">Dark</DashboardMenuRadioItem>
          <DashboardMenuRadioItem value="system">System</DashboardMenuRadioItem>
        </DashboardMenuRadioGroup>
      </DashboardMenuContent>
    </DashboardMenu>
  )
}
