"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GitPullRequest,
  Inbox,
  CalendarClock,
  Rocket,
  GitFork,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { AppIcon } from "@/components/app-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { useGithubStart } from "@/components/landing/use-github-start";
import { useSession } from "@/lib/auth-client";
export function Landing() {
  const { start, pending, notice } = useGithubStart();
  const { data } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (data?.user) router.replace("/review");
  }, [data, router]);
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <AppIcon className="size-7" />
          Docks
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <ThemeToggle />
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="mx-auto max-w-2xl py-20 text-center">
          <Badge variant="secondary">Code review for GitHub teams</Badge>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Know what needs review.
            <br />
            Ship with confidence.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            One workspace for pull requests, reviewers, and release blockers. A
            clear next step for everyone on your team.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" disabled={pending} onClick={() => void start()}>
              <GitFork />
              {pending ? "Connecting…" : "Start with GitHub"}
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
          {notice && (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Free for up to 5 people and 3 repositories.
          </p>
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Inbox,
              title: "Your next review, clear.",
              text: "A personal inbox, exact merge blockers, and review progress that follows you across devices.",
            },
            {
              icon: CalendarClock,
              title: "Keep reviews moving.",
              text: "Work-hour deadlines, reminders, and backup reviewer requests when your team needs them.",
            },
            {
              icon: Rocket,
              title: "A complete release picture.",
              text: "Group pull requests into releases, check readiness, and export review evidence.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="mb-3 size-5" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <section className="mx-auto max-w-2xl py-20">
          <h2 className="mb-6 text-2xl font-semibold">Common questions</h2>
          <Accordion type="single" collapsible>
            <AccordionItem value="github">
              <AccordionTrigger>Does Docks replace GitHub?</AccordionTrigger>
              <AccordionContent>
                Docks connects to GitHub. Your repositories and review history
                stay there; Docks brings your team’s review workflow into one
                workspace.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="free">
              <AccordionTrigger>Can we start free?</AccordionTrigger>
              <AccordionContent>
                Yes. Free includes up to 5 workspace members and 3 enabled
                repositories.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="team">
              <AccordionTrigger>What does Team cost?</AccordionTrigger>
              <AccordionContent>
                Team costs $12 USD per workspace member per month, plus
                applicable taxes. It adds review deadlines, release tools, and
                evidence exports.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
          <span>Docks · From review to release.</span>
          <Link href="/pricing">Plans and pricing</Link>
        </div>
      </footer>
    </div>
  );
}
