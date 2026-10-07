"use client"

import Link from "next/link"

import { PersonAvatar } from "@/components/person-avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type TeamMember = {
  userId: string
  name: string
  githubLogin: string | null
  away: boolean
  awayUntil: string | null
  openReviews: number
  maxOpenReviews: number | null
  overLimit: boolean
  teams: { id: string; name: string }[]
}

export function TeamGrid({ people }: { people: TeamMember[] }) {
  return (
    <div className="stagger grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
      {people.map((p) => (
        <div key={p.userId} className="group relative pt-2">
          <Card className="bg-card surface-hover relative mt-8 overflow-visible py-0 pt-16 text-center">
            <div className="absolute inset-x-0 -top-8 flex justify-center">
              <div className="bg-background ring-hairline rounded-full p-1.5 ring-1">
                <PersonAvatar seed={p.userId} name={p.name} githubLogin={p.githubLogin} className="size-24 border-2" />
              </div>
            </div>
            <CardContent className="flex flex-col items-center p-6">
              <h3 className="text-foreground mb-1 text-lg font-medium tracking-tight">{p.name}</h3>
              {p.githubLogin && (
                <Link href={`https://github.com/${p.githubLogin}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground mb-3 font-mono text-xs underline-offset-4 hover:underline">
                  @{p.githubLogin}
                </Link>
              )}
              <div className="mb-6 flex flex-wrap justify-center gap-1.5">
                {p.away && <Badge variant="secondary">Away until {p.awayUntil}</Badge>}
                {p.teams.map((t) => (
                  <Badge key={t.id} variant="outline">
                    {t.name}
                  </Badge>
                ))}
              </div>
              <div className="border-hairline w-full border-t pt-4 text-center">
                <span className={cn("mb-0.5 block text-2xl font-medium tabular-nums", p.overLimit ? "text-warning-text" : "text-foreground")}>
                  {p.openReviews}
                  {p.maxOpenReviews ? <span className="text-text-3 text-xl"> / {p.maxOpenReviews}</span> : null}
                </span>
                <span className="text-muted-foreground text-sm">Open reviews</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
