"use client"

import { PersonAvatar } from "@/components/person-avatar"

/** A GitHub person: their GitHub avatar, then a robot, then an initial. */
export function GhAvatar({ login, src, className }: { login: string; src?: string; className?: string }) {
  return <PersonAvatar seed={login} name={login} src={src} githubLogin={src ? null : login} className={className} />
}
