"use client";
import {
  RiGithubFill,
  RiArrowRightLine,
  RiGitPullRequestLine,
  RiCheckboxCircleLine,
  RiTimeLine,
} from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { AppIcon } from "@/components/app-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { useGithubStart } from "@/components/landing/use-github-start";
import { useSession } from "@/lib/auth-client";
export function Landing() {
  const { start, pending, notice } = useGithubStart();
  const router = useRouter();
  const { data } = useSession();
  useEffect(() => {
    if (data?.user) router.replace("/review");
  }, [data, router]);
  return (
    <div className="min-h-svh bg-background-full text-text-primary">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-headline-semibold"
          aria-label="Docks home"
        >
          <AppIcon className="size-9" />
          Docks
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="text-body-medium text-text-secondary hover:text-text-primary"
          >
            Sign in{" "}
            <RiArrowRightLine className="ms-1 inline size-4" aria-hidden />
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full bg-brand-lime px-3 py-1.5 text-caption-1-semibold text-brand-ink">
            Less waiting. Better reviews.
          </span>
          <h1 className="text-title-1-medium text-balance !text-5xl !leading-[1.08] !tracking-tight sm:!text-6xl">
            Code review,
            <br />
            with a clear
            <br />
            <span className="text-button-ghost-foreground">next step.</span>
          </h1>
          <p className="max-w-sm text-headline-regular text-text-secondary">
            Read each PR in the right order. Know what to check, what blocks a
            merge, and who can help.
          </p>
          <Button
            onClick={start}
            disabled={pending}
            leadingIcon={RiGithubFill}
            className="h-11 px-4"
          >
            {pending ? "Opening GitHub…" : "Continue with GitHub"}
          </Button>
          <p className="text-caption-1-regular text-text-secondary">
            Start free. Connect your GitHub repositories.
          </p>
          {notice && (
            <p
              role="status"
              className="text-body-2-regular text-text-secondary"
            >
              {notice}
            </p>
          )}
        </div>
        <section
          aria-label="Example review workflow"
          className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3 border-b border-separator-border pb-4">
            <span className="flex items-center gap-2 text-body-medium">
              <RiGitPullRequestLine
                className="size-5 text-button-ghost-foreground"
                aria-hidden
              />{" "}
              Your review desk
            </span>
            <Chip variant="caption" color="purple">
              Example
            </Chip>
          </div>
          <div className="flex flex-col gap-5 py-6">
            <p className="text-caption-1-regular text-text-secondary">
              acme / api · #128
            </p>
            <h2 className="text-headline-semibold">Make retries safe</h2>
            <div className="flex gap-2">
              <Chip variant="caption" color="lime">
                Checks passed
              </Chip>
              <Chip variant="caption" color="yellow">
                Needs review
              </Chip>
            </div>
            <ol className="flex flex-col gap-4">
              {[
                "Understand the change",
                "Check the risky paths",
                "Review, then merge",
              ].map((label, index) => (
                <li
                  key={label}
                  className="flex items-center gap-3 text-body-regular"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-caption-1-semibold text-button-ghost-foreground">
                    {index + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-background-secondary-default p-4">
            <RiTimeLine
              className="mt-0.5 size-5 shrink-0 text-button-ghost-foreground"
              aria-hidden
            />
            <div>
              <p className="text-body-medium">Keep reviews moving</p>
              <p className="mt-1 text-body-2-regular text-text-secondary">
                Deadlines, a personal inbox, and a clear path to release.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-5xl flex-wrap gap-x-8 gap-y-3 border-t border-separator-border px-6 py-6 text-body-2-regular text-text-secondary">
        {["Guided reading", "Exact merge blockers", "Release readiness"].map(
          (label) => (
            <span key={label} className="flex items-center gap-2">
              <RiCheckboxCircleLine
                className="size-4 text-button-ghost-foreground"
                aria-hidden
              />
              {label}
            </span>
          ),
        )}
      </footer>
    </div>
  );
}
