import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { PlanCards } from "@/components/plan-cards";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Pricing · Docks",
  description:
    "Start free. Upgrade to Team for review deadlines, release readiness, and evidence exports.",
};

export default function Pricing() {
  const action =
    "flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors";
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5 font-medium">
          <AppIcon className="size-8" />
          Docks
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-14 sm:pt-20">
        <div className="mb-12 max-w-xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Simple pricing
          </p>
          <h1 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            Less waiting.
            <br />
            More shipping.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Start with a clear review queue. Upgrade when your team needs
            deadlines, release visibility, and a record of every review.
          </p>
        </div>
        <PlanCards
          actions={{
            free: (
              <Button asChild variant="outline" className="w-full">
                <Link href="/signup">Start free</Link>
              </Button>
            ),
            team: (
              <Button asChild className="w-full">
                <Link href="/settings/billing">Choose Team</Link>
              </Button>
            ),
          }}
        />
        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          Team is billed monthly for each workspace member. Applicable taxes are
          added at checkout.
        </p>
        <div className="mt-14 grid gap-8 border-t pt-8 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">What counts as a member?</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Each person who belongs to your workspace is a billable seat on
              Team.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium">
              Can I manage my subscription?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Workspace owners can open the billing portal from Settings to
              manage their subscription and payment details.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
