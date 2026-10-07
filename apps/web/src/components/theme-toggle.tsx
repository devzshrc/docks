"use client"

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const OPTIONS = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
] as const

/** Light / Dark / System, as a segmented control. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // The stored theme is only known on the client; render neutral until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="segmented" role="group" aria-label="Color theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mounted && theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.value)}
          className="flex items-center !px-2 !py-1"
        >
          <o.icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  )
}
