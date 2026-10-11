"use client";
import { useQuery } from "@tanstack/react-query";
import {
  RiArrowLeftLine,
  RiBarChartLine,
  RiBuildingLine,
  RiGroupLine,
  RiHistoryLine,
  RiPulseLine,
  RiShieldKeyholeLine,
  RiMenuLine,
  RiCloseLine,
} from "@remixicon/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/utils/cx";
const sections = [
  { path: "/admin", label: "Overview", icon: RiBarChartLine },
  { path: "/admin/users", label: "Users", icon: RiGroupLine },
  { path: "/admin/workspaces", label: "Workspaces", icon: RiBuildingLine },
  { path: "/admin/usage", label: "Usage & retention", icon: RiPulseLine },
  { path: "/admin/activity", label: "Audit trail", icon: RiHistoryLine },
  { path: "/admin/health", label: "System health", icon: RiShieldKeyholeLine },
];
export function AdminShell({ children }: { children: ReactNode }) {
  const trpc = useTRPC(),
    path = usePathname();
  const access = useQuery(trpc.admin.access.queryOptions());
  const [open, setOpen] = useState(false);
  if (access.isPending)
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Skeleton className="h-12 w-60" />
        <Skeleton className="mt-8 h-80 w-full" />
      </div>
    );
  if (access.error)
    return (
      <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-5 p-8">
        <RiShieldKeyholeLine className="size-10 text-foreground-icon-secondary" />
        <h1 className="text-title-2-medium">Administration is protected</h1>
        <p className="text-body-regular text-text-secondary">
          {access.error.message}
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/settings/account">Account settings</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login?next=%2Fadmin">Sign in</Link>
          </Button>
        </div>
      </main>
    );
  const active =
    sections.find(
      (s) =>
        s.path === path || (s.path !== "/admin" && path.startsWith(s.path)),
    ) ?? sections[0];
  return (
    <div className="min-h-svh bg-background-full text-text-primary lg:flex">
      <aside
        className={cx(
          "border-separator-border bg-background-primary-default lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-60 lg:shrink-0 lg:flex-col lg:border-e",
          open ? "block" : "hidden",
        )}
      >
        <Link
          href="/admin"
          className="flex items-center gap-3 border-b border-separator-border p-5"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-background-tertiary-default">
            <RiShieldKeyholeLine className="size-5" />
          </span>
          <span className="text-headline-medium">
            Docks
            <span className="block text-caption-1-medium text-text-tertiary">
              Administration
            </span>
          </span>
        </Link>
        <div className="p-3">
          <p className="px-3 py-3 text-caption-1-medium text-text-tertiary">
            PLATFORM
          </p>
          <nav aria-label="Admin navigation" className="grid gap-1">
            {sections.map((s) => (
              <Link
                key={s.path}
                href={s.path}
                onClick={() => setOpen(false)}
                aria-current={active.path === s.path ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-body-2-medium transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  active.path === s.path
                    ? "bg-primary-alpha-10 text-primary-base"
                    : "text-text-secondary hover:bg-background-secondary-hover",
                )}
              >
                <s.icon className="size-4" />
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto grid gap-3 border-t border-separator-border p-5">
          <p className="truncate text-caption-1-medium text-text-secondary">
            {access.data.email}
          </p>
          <p className="text-caption-1-medium capitalize text-text-tertiary">
            {access.data.role} access
          </p>
          <Link
            href="/review"
            className="flex items-center gap-2 text-body-2-medium text-text-secondary"
          >
            <RiArrowLeftLine className="size-4" />
            Back to product
          </Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center gap-3 border-b border-separator-border bg-background-primary-default px-4 md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <RiCloseLine /> : <RiMenuLine />}
          </Button>
          <span className="text-headline-medium">{active.label}</span>
          <span className="ms-auto rounded-full border border-separator-border px-3 py-1 text-caption-1-medium text-text-secondary">
            Live workspace data
          </span>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
