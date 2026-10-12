"use client";
import { useQuery } from "@tanstack/react-query";
import {
  RiArrowLeftLine,
  RiBarChartBoxLine,
  RiBuilding2Line,
  RiGroupLine,
  RiHistoryLine,
  RiLineChartLine,
  RiMenuLine,
  RiPulseLine,
  RiSearchLine,
  RiShieldKeyholeLine,
  RiCloseLine,
} from "@remixicon/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/app-icon";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTRPC } from "@/trpc/react";

type Section = { path: string; label: string; icon: typeof RiGroupLine; key: string };
const groups: { title: string; items: Section[] }[] = [
  {
    title: "Insights",
    items: [
      { path: "/admin", label: "Overview", icon: RiBarChartBoxLine, key: "o" },
      { path: "/admin/usage", label: "Usage & retention", icon: RiPulseLine, key: "r" },
      { path: "/admin/metrics", label: "Growth metrics", icon: RiLineChartLine, key: "m" },
    ],
  },
  {
    title: "Customers",
    items: [
      { path: "/admin/users", label: "Users", icon: RiGroupLine, key: "u" },
      { path: "/admin/workspaces", label: "Workspaces", icon: RiBuilding2Line, key: "w" },
    ],
  },
  {
    title: "Operations",
    items: [
      { path: "/admin/activity", label: "Audit trail", icon: RiHistoryLine, key: "a" },
      { path: "/admin/health", label: "System health", icon: RiShieldKeyholeLine, key: "h" },
    ],
  },
];
const sections = groups.flatMap((g) => g.items);
const activeFor = (path: string) =>
  sections.find((s) => s.path === path || (s.path !== "/admin" && path.startsWith(s.path))) ?? sections[0]!;

/** ⌘K: jump to a section, or search users and workspaces by what you typed. */
function AdminJump({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (href: string, search?: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
    // When the list is already open the page doesn't remount, so hand it the query directly.
    if (search !== undefined) window.dispatchEvent(new CustomEvent("admin-search", { detail: search }));
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Go to an admin section or search records">
      <CommandInput placeholder="Go to a section, or search users and workspaces…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No matching section.</CommandEmpty>
        {q.trim() && (
          <CommandGroup heading="Search">
            <CommandItem value={`search users ${q}`} onSelect={() => go(`/admin/users?q=${encodeURIComponent(q.trim())}`, q.trim())}>
              <RiGroupLine />
              Users matching “{q.trim()}”
            </CommandItem>
            <CommandItem value={`search workspaces ${q}`} onSelect={() => go(`/admin/workspaces?q=${encodeURIComponent(q.trim())}`, q.trim())}>
              <RiBuilding2Line />
              Workspaces matching “{q.trim()}”
            </CommandItem>
          </CommandGroup>
        )}
        {groups.map((g) => (
          <CommandGroup key={g.title} heading={g.title}>
            {g.items.map((s) => (
              <CommandItem key={s.path} value={s.label} onSelect={() => go(s.path)}>
                <s.icon />
                {s.label}
                <CommandShortcut>G {s.key.toUpperCase()}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const path = usePathname();
  const router = useRouter();
  const access = useQuery(trpc.admin.access.queryOptions());
  const [navOpen, setNavOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);

  // ⌘K opens the jump menu; "g" then a letter goes straight to a section (like GitHub and Linear).
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen((o) => !o);
        return;
      }
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "g") {
        pendingG = Date.now();
        return;
      }
      if (Date.now() - pendingG < 900) {
        const s = sections.find((x) => x.key === e.key.toLowerCase());
        if (s) router.push(s.path);
        pendingG = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (access.isPending)
    return (
      <div className="flex min-h-svh">
        <div className="hidden w-60 border-e border-sidebar-border bg-sidebar lg:block" />
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  if (access.error)
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 p-8">
        <span className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <RiShieldKeyholeLine className="size-5" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-lg font-medium">Administration is protected</h1>
          <p className="text-sm text-muted-foreground">{access.error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/settings/account">Account settings</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login?next=%2Fadmin">Sign in</Link>
          </Button>
        </div>
      </main>
    );

  const active = activeFor(path);
  const detail = path !== active.path;

  return (
    <div className="min-h-svh bg-background text-foreground lg:flex">
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="animate-in fade-in fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <aside
        className={cn("fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e border-sidebar-border bg-sidebar transition-transform duration-200 ease-power3-out lg:sticky lg:top-0 lg:h-svh lg:w-60 lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/admin" className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <AppIcon className="size-8 shrink-0" />
          <span className="grid gap-1 leading-none">
            <span className="text-sm font-medium">Docks</span>
            <span className="text-xs text-subtle">Administration</span>
          </span>
        </Link>
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => setJumpOpen(true)}
            className="flex h-8 w-full items-center gap-2 rounded-lg bg-secondary px-2.5 text-[13px] text-subtle shadow-control transition-colors hover:text-foreground"
          >
            <RiSearchLine className="size-3.5" />
            Jump to…
            <kbd className="ms-auto rounded bg-muted px-1.5 font-sans text-[10px] text-muted-foreground">⌘K</kbd>
          </button>
        </div>
        <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto">
          {groups.map((g, i) => (
            <div key={g.title} className={cn("grid gap-px p-3", i > 0 && "border-t border-sidebar-border")}>
              <p className="px-2 pb-1.5 text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">{g.title}</p>
              {g.items.map((s) => {
                const on = active.path === s.path;
                return (
                  <Link
                    key={s.path}
                    href={s.path}
                    onClick={() => setNavOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn("group flex h-8 items-center gap-2 rounded-lg px-2 text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      on
                        ? "bg-sidebar-primary font-medium text-foreground shadow-control"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <s.icon className={cn("size-3.5 shrink-0", on ? "text-primary" : "text-subtle group-hover:text-icon")} />
                    {s.label}
                    <kbd className="ms-auto hidden font-sans text-[10px] text-faint group-hover:inline">G {s.key.toUpperCase()}</kbd>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <PersonAvatar seed={access.data.email} name={access.data.email} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{access.data.email}</p>
              <p className="text-[11px] text-subtle capitalize">{access.data.role} access</p>
            </div>
          </div>
          <Link
            href="/review"
            className="mt-1 flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <RiArrowLeftLine className="size-3.5" />
            Back to Docks
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md md:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ms-1 lg:hidden"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            {navOpen ? <RiCloseLine /> : <RiMenuLine />}
          </Button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link href="/admin" className="text-muted-foreground transition-colors hover:text-foreground">
              Admin
            </Link>
            <span className="text-faint">/</span>
            {detail ? (
              <>
                <Link href={active.path} className="text-muted-foreground transition-colors hover:text-foreground">
                  {active.label}
                </Link>
                <span className="text-faint">/</span>
                <span className="truncate font-medium">Details</span>
              </>
            ) : (
              <span className="truncate font-medium">{active.label}</span>
            )}
          </nav>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-status shadow-[0_0_0_2px_color-mix(in_oklab,var(--status)_25%,transparent)]" />
            Live data
          </span>
          <ThemeToggle />
        </header>
        <main key={path} className="animate-in fade-in slide-in-from-bottom-[3px] mx-auto max-w-7xl p-4 duration-200 md:p-6">
          {children}
        </main>
      </div>
      <AdminJump open={jumpOpen} onOpenChange={setJumpOpen} />
    </div>
  );
}
