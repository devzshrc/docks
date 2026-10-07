"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

/** Placeholder picture from robohash.org. The seed is an opaque id, never an email or a name. */
export const robohash = (seed: string) => `https://robohash.org/${encodeURIComponent(seed)}.png?set=set1&size=96x96`

/**
 * One avatar for everyone: their own picture when there is one, a GitHub avatar when we know the login,
 * otherwise a stable robot generated from their id. Falls back to an initial if images can't load.
 */
export function PersonAvatar({
  seed,
  name,
  src,
  githubLogin,
  className,
}: {
  /** Stable, non-identifying id (user id, or the login for GitHub-only people). */
  seed: string
  name?: string
  src?: string | null
  githubLogin?: string | null
  className?: string
}) {
  const chain = [src, githubLogin ? `https://github.com/${githubLogin}.png?size=96` : null, robohash(seed)].filter((u): u is string => Boolean(u))
  const [step, setStep] = useState(0)
  const label = name ?? githubLogin ?? seed
  if (step >= chain.length) {
    return (
      <span className={cn("bg-hover text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium uppercase", className)} title={label} aria-label={label}>
        {label.slice(0, 1)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={chain[step]}
      src={chain[step]}
      alt={label}
      title={label}
      loading="lazy"
      onError={() => setStep((s) => s + 1)}
      className={cn("bg-hover size-5 shrink-0 rounded-full object-cover", className)}
    />
  )
}
