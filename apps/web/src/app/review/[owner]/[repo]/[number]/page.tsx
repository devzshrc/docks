import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { GuidedReview } from "@/components/review/guided-review"

export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>
}) {
  const { owner, repo, number } = await params
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1) notFound()
  return (
    <AppShell title="Review">
      <GuidedReview repo={`${owner}/${repo}`} number={n} />
    </AppShell>
  )
}
