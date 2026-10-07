"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

/** GitHub avatar with an initial as fallback, so a blocked or missing image never shows a broken icon. */
export function GhAvatar({ login, src, className }: { login: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || (!src && !login)) {
    return (
      <span className={cn("bg-hover text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium uppercase", className)} title={login} aria-label={login}>
        {login.slice(0, 1)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? `https://github.com/${login}.png?size=48`}
      alt={login}
      title={login}
      onError={() => setFailed(true)}
      className={cn("bg-hover size-5 shrink-0 rounded-full object-cover", className)}
    />
  )
}
