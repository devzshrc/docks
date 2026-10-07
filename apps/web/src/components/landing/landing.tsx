"use client"

import { IconBrandGithub } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { useGithubStart } from "@/components/landing/use-github-start"
import { useSession } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

const pill = "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-[background-color,transform,box-shadow] active:scale-[0.98]"
const primaryPill = `${pill} bg-foreground text-background hover:bg-foreground/90`

/** Signed-in visitors skip the landing page. */
function SkipIfSignedIn() {
  const router = useRouter()
  const { data } = useSession()
  useEffect(() => {
    if (data?.user) router.replace("/review")
  }, [data, router])
  return null
}

export function Landing() {
  const { start, pending, notice } = useGithubStart()

  return (
    <div className="bg-background text-foreground min-h-svh">
      <SkipIfSignedIn />

      <main className="mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display max-w-2xl text-[clamp(2.2rem,6vw,3.75rem)] leading-[1.02] font-normal tracking-[-0.025em] text-balance">
          Code review, read in the right order.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-md text-base leading-relaxed text-pretty">
          Every PR as a guided read — what changed, what to check, what's stuck.
        </p>
        <div className="mt-6">
          <button type="button" onClick={start} disabled={pending} className={cn(primaryPill)}>
            <IconBrandGithub className="size-4" aria-hidden />
            {pending ? "Opening GitHub…" : "Continue with GitHub"}
          </button>
        </div>
        {notice && (
          <p role="status" className="text-muted-foreground mt-3 max-w-md text-xs">
            {notice}
          </p>
        )}
      </main>
    </div>
  )
}
