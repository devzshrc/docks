"use client"

import { DashboardCircleIcon, GitPullRequestIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { IconBrandGithub, IconBrandSlack } from "@tabler/icons-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { BrandIcon, Px0Icon } from "@/components/brand-icons"
import { ProductPreview } from "@/components/landing/product-preview"
import { useGithubStart } from "@/components/landing/use-github-start"
import { DiscoverButton } from "@/components/obsidian/discover-button"
import { DraggableMarquee } from "@/components/obsidian/draggable-marquee"
import { FlipText } from "@/components/obsidian/flip-text"
import { HoverImg } from "@/components/obsidian/hover-img"
import { SplitShowcase } from "@/components/obsidian/split-showcase"
import { TextStream } from "@/components/obsidian/text-stream"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/auth-client"

const AREAS = [
  { title: "Board", label: "See what's waiting, who has it, what's stuck", imageSrc: "/landing/board.svg" },
  { title: "Guided review", label: "Read the changes in the right order", imageSrc: "/landing/review.svg" },
  { title: "Issues", label: "File a good one in seconds", imageSrc: "/landing/issues.svg" },
  { title: "Insights", label: "Know where review time goes", imageSrc: "/landing/insights.svg" },
]

const STEPS = [
  { n: "1", title: "Connect GitHub", body: "Sign in with GitHub and pick the repositories. No new accounts, no configuration." },
  { n: "2", title: "See what's waiting", body: "Every open pull request lands on one board by review state, with the stuck ones flagged." },
  { n: "3", title: "Read it in order", body: "A guide groups the changes, explains why each matters, and gives you a checklist before you approve." },
]

function LinearMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M2.4 13.6a10 10 0 0 0 8 8L2.4 13.6Zm-.3-3.1 11.4 11.4a10 10 0 0 0 2.6-.9L3 7.9a10 10 0 0 0-.9 2.6Zm2.2-4.7 13.9 13.9a10 10 0 0 0 1.8-1.6L5.9 4a10 10 0 0 0-1.6 1.8Zm3-2.7 13.6 13.6A10 10 0 0 0 7.3 3.1ZM12 2a10 10 0 0 0-2.4.3l12.1 12.1A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

const TOOLS: { id: string; name: string; icon: React.ReactNode }[] = [
  { id: "github", name: "GitHub", icon: <IconBrandGithub className="size-5" /> },
  { id: "slack", name: "Slack", icon: <IconBrandSlack className="size-5" /> },
  { id: "linear", name: "Linear", icon: <LinearMark className="size-5" /> },
  { id: "claude", name: "Claude Code", icon: <BrandIcon brand="claude" className="size-5" /> },
  { id: "codex", name: "Codex", icon: <BrandIcon brand="codex" className="size-5" /> },
  { id: "cursor", name: "Cursor", icon: <BrandIcon brand="cursor" className="size-5" /> },
  { id: "px0", name: "px0", icon: <Px0Icon className="h-4" /> },
]

/** Signed-in visitors skip the landing page. */
function SkipIfSignedIn() {
  const router = useRouter()
  const { data } = useSession()
  useEffect(() => {
    if (data?.user) router.replace("/review")
  }, [data, router])
  return null
}

const section = "mx-auto w-full max-w-6xl px-5 sm:px-8"

export function Landing() {
  const { start, pending } = useGithubStart()

  return (
    <div className="bg-background text-foreground min-h-svh">
      <SkipIfSignedIn />

      <header className="bg-background/80 border-hairline sticky top-0 z-40 border-b backdrop-blur">
        <div className={`${section} flex h-14 items-center justify-between`}>
          <Link href="/" className="flex items-center gap-2.5 text-sm font-medium">
            <span className="bg-foreground text-background flex size-6 items-center justify-center rounded-md text-xs font-medium" aria-hidden>
              D
            </span>
            Docks
          </Link>
          <nav aria-label="Primary" className="text-muted-foreground hidden items-center gap-6 text-sm md:flex">
            <a href="#how" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#everything" className="hover:text-foreground transition-colors">
              What&apos;s inside
            </a>
            <a href="#tools" className="hover:text-foreground transition-colors">
              Integrations
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" onClick={start} pending={pending}>
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]" />
          <div className={`${section} relative flex flex-col items-center pt-20 pb-16 text-center sm:pt-28`}>
            <span className="pill animate-in fade-in slide-in-from-bottom-2 mb-6 duration-500" data-tone="info">
              Guided code review for GitHub teams
            </span>
            <h1 className="animate-in fade-in slide-in-from-bottom-2 max-w-4xl text-4xl font-medium tracking-tight text-balance duration-700 sm:text-6xl sm:leading-[1.05]">
              <FlipText className="justify-center">Review code the way it was meant to be read.</FlipText>
            </h1>
            <p className="text-muted-foreground animate-in fade-in mt-6 max-w-2xl text-base text-pretty duration-1000 sm:text-lg">
              Docks turns every pull request into a guided read: one board of what&apos;s waiting, a clear order for the changes, and the context to decide with confidence.
              Faster reviews, fewer surprises, calmer releases.
            </p>
            <div className="animate-in fade-in mt-9 flex flex-col items-center gap-4 duration-1000 sm:flex-row">
              <DiscoverButton label={pending ? "Opening GitHub…" : "Continue with GitHub"} onClick={start} disabled={pending} />
              <a href="#how" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                See how it works ↓
              </a>
            </div>
            <p className="text-text-3 mt-5 text-xs">Free for up to 3 repositories · No credit card</p>
          </div>
          <div className={`${section} relative pb-20`}>
            <ProductPreview className="mx-auto max-w-5xl" />
          </div>
        </section>

        {/* Vision */}
        <section aria-label="Our vision" className="border-hairline border-y">
          <div className={section}>
            <TextStream prefix="Docks makes review" items={["faster.", "clearer.", "calmer.", "kinder."]} height="360px" fontSize="clamp(2.5rem, 7vw, 5rem)" fontWeight={500} />
          </div>
          <p className="text-muted-foreground mx-auto max-w-2xl px-5 pb-20 text-center text-base text-pretty sm:text-lg">
            Code review is where quality is won, and where teams quietly lose days. We think it should feel like reading a well-edited story, not digging through a pile. Docks
            gives reviewers the order, the context and the checklist, so good reviews become the easy ones.
          </p>
        </section>

        {/* How it works */}
        <section id="how" className={`${section} scroll-mt-20 py-24`}>
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">From pull request to approved, in three steps.</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-card border-hairline rounded-2xl border p-6">
                <span className="pill" data-tone="info">
                  Step {s.n}
                </span>
                <h3 className="mt-4 text-lg font-medium tracking-tight">{s.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Two views */}
        <section className={`${section} pb-24`}>
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Two views. One flow.</h2>
            <p className="text-muted-foreground mt-3 text-base">Start from everything waiting, drop into one pull request, and come back without losing your place.</p>
          </div>
          <SplitShowcase
            className="mx-auto max-w-4xl"
            items={[
              {
                id: "board",
                icon: <HugeiconsIcon icon={DashboardCircleIcon} size={28} />,
                title: <h3 className="text-xl font-medium tracking-tight">The board</h3>,
                description: "Every open pull request by review state: who has it, how long it has waited, what's stuck.",
                tag: "See",
              },
              {
                id: "review",
                icon: <HugeiconsIcon icon={GitPullRequestIcon} size={28} />,
                title: <h3 className="text-xl font-medium tracking-tight">Guided review</h3>,
                description: "Changes grouped and ordered, with a summary, a checklist and inline comments, then approve or merge.",
                tag: "Read",
              },
            ]}
          />
        </section>

        {/* What's inside */}
        <section id="everything" className={`${section} scroll-mt-20 pb-24`}>
          <div className="mb-8 max-w-2xl">
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Everything a review needs.</h2>
            <p className="text-muted-foreground mt-3 text-base">Hover a row for a closer look.</p>
          </div>
          <HoverImg projects={AREAS} />
        </section>

        {/* Integrations */}
        <section id="tools" className="border-hairline scroll-mt-20 border-y py-20">
          <div className={`${section} mb-10 max-w-2xl`}>
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Plays well with your tools.</h2>
            <p className="text-muted-foreground mt-3 text-base">Built on GitHub, with Slack and Linear for context, and one-click hand-off to your coding agent. Drag to explore.</p>
          </div>
          <div className="[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            <DraggableMarquee
              items={TOOLS}
              speed={0.6}
              gapClassName="gap-3"
              label="Integrations. Drag or use the left and right arrow keys."
              itemClassName="rounded-full"
              renderItem={(item) => (
                <div className="tex-neutral flex h-12 items-center gap-2.5 rounded-full px-5 text-sm font-medium select-none">
                  {item.icon}
                  {item.name}
                </div>
              )}
            />
          </div>
        </section>

        {/* Final CTA */}
        <section className={`${section} py-24`}>
          <div className="bg-card border-hairline relative overflow-hidden rounded-3xl border px-6 py-16 text-center sm:px-12">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_100%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent)]" />
            <h2 className="relative text-3xl font-medium tracking-tight text-balance sm:text-5xl">
              <FlipText className="justify-center">Make the next review the easy one.</FlipText>
            </h2>
            <p className="text-muted-foreground relative mx-auto mt-4 max-w-xl text-base">Connect GitHub in one click and see your board in under a minute.</p>
            <div className="relative mt-8 flex justify-center">
              <DiscoverButton label={pending ? "Opening GitHub…" : "Continue with GitHub"} onClick={start} disabled={pending} />
            </div>
            <p className="text-text-3 relative mt-5 text-xs">Free for up to 3 repositories · No credit card</p>
          </div>
        </section>
      </main>

      <footer className="border-hairline border-t">
        <div className={`${section} text-muted-foreground flex flex-col items-center justify-between gap-3 py-8 text-xs sm:flex-row`}>
          <span className="flex items-center gap-2">
            <span className="bg-foreground text-background flex size-5 items-center justify-center rounded text-[10px] font-medium" aria-hidden>
              D
            </span>
            Docks · Guided code review
          </span>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Create account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
