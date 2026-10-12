"use client"

import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

/** One icon button; the menu offers Light, Dark and System, and colours cross-fade when it changes. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === "dark"

  function choose(value: string) {
    const next = value === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value
    const apply = () => {
      // Flip the class ourselves so the new theme is in the DOM before the browser takes the "after"
      // snapshot; next-themes would only apply it in an effect, a frame too late.
      const root = document.documentElement
      root.classList.toggle("dark", next === "dark")
      root.classList.toggle("light", next === "light")
      root.style.colorScheme = next
      setTheme(value)
    }
    if (next === resolvedTheme || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply()
      return
    }
    document.startViewTransition(apply)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Color theme" className={className}>
          <HugeiconsIcon key={String(dark)} icon={dark ? Moon02Icon : Sun03Icon} size={14} className="animate-in spin-in-45 zoom-in-50 fade-in duration-300" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={mounted ? (theme ?? "system") : "system"} onValueChange={choose}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
