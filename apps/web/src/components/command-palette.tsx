"use client";

import {
  Analytics01Icon,
  Calendar03Icon,
  InboxIcon,
  Rocket01Icon,
  UserMultipleIcon,
  CheckListIcon,
  ArrowTurnBackwardIcon,
  Clock01Icon,
  ConnectIcon,
  CreditCardIcon,
  DashboardCircleIcon,
  GitPullRequestIcon,
  Folder01Icon,
  ListViewIcon,
  AlertCircleIcon,
  PlusSignIcon,
  Search01Icon,
  Settings02Icon,
  Shield01Icon,
  UserCircleIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { useNewIssue } from "@/components/new-issue/provider";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

type IconDef = typeof Search01Icon;

/** `keys` are extra words people type for the same page ("settings", "team", "sla"). */
const PAGES: { label: string; href: string; icon: IconDef; keys?: string }[] = [
  {
    label: "Inbox",
    href: "/inbox",
    icon: InboxIcon,
    keys: "notifications my work todo",
  },
  {
    label: "Reviews",
    href: "/review",
    icon: DashboardCircleIcon,
    keys: "board pull requests prs",
  },
  {
    label: "Waiting on me",
    href: "/review?waiting=1",
    icon: Clock01Icon,
    keys: "my reviews todo",
  },
  {
    label: "My pull requests",
    href: "/review?mine=1",
    icon: GitPullRequestIcon,
    keys: "mine authored prs",
  },
  { label: "Issues", href: "/issues", icon: CheckListIcon, keys: "bugs tasks" },
  {
    label: "My issues",
    href: "/issues?view=mine",
    icon: CheckListIcon,
    keys: "assigned",
  },
  {
    label: "Issue board",
    href: "/issues?view=board",
    icon: CheckListIcon,
    keys: "kanban",
  },
  {
    label: "Deadlines",
    href: "/deadlines",
    icon: Calendar03Icon,
    keys: "sla due overdue schedule review deadlines",
  },
  {
    label: "Releases",
    href: "/releases",
    icon: Rocket01Icon,
    keys: "ship deploy",
  },
  {
    label: "Insights",
    href: "/insights",
    icon: Analytics01Icon,
    keys: "analytics metrics charts stats",
  },
  {
    label: "People",
    href: "/team",
    icon: UserGroupIcon,
    keys: "team members reviewers workload",
  },
  {
    label: "Settings",
    href: "/settings/workspace",
    icon: Settings02Icon,
    keys: "workspace preferences configure",
  },
  {
    label: "Repositories",
    href: "/settings/repositories",
    icon: Folder01Icon,
    keys: "settings repos checklist rules",
  },
  {
    label: "Setup health",
    href: "/settings/setup",
    icon: ConnectIcon,
    keys: "settings setup health webhooks broken sync status diagnose",
  },
  {
    label: "Integrations",
    href: "/settings/integrations",
    icon: ConnectIcon,
    keys: "settings github slack linear connect",
  },
  {
    label: "Invite people",
    href: "/settings/workspace#invite",
    icon: UserMultipleIcon,
    keys: "add teammate member invite",
  },
  {
    label: "Audit log",
    href: "/settings/audit",
    icon: ListViewIcon,
    keys: "settings history activity",
  },
  {
    label: "Billing",
    href: "/settings/billing",
    icon: CreditCardIcon,
    keys: "settings plan upgrade payment subscription",
  },
  {
    label: "Account",
    href: "/settings/account",
    icon: UserCircleIcon,
    keys: "settings profile password",
  },
  {
    label: "Security",
    href: "/settings/account#security",
    icon: Shield01Icon,
    keys: "settings two-factor 2fa sessions",
  },
];

type Item = {
  key: string;
  group: "Actions" | "Pages" | "Pull requests" | "Issues";
  label: string;
  hint?: string;
  href?: string;
  run?: () => void;
  icon: IconDef;
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-[10.5px] font-medium">
      {children}
    </kbd>
  );
}

/** ⌘K / Ctrl+K: jump to a page or a pull request. Core shadcn command dialog. */
export function CommandPalette() {
  const trpc = useTRPC();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { open: openIssue, canCreate } = useNewIssue();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const board = useQuery({
    ...trpc.review.board.queryOptions({
      workspaceId: workspace?.id ?? "",
      filters: { sort: "oldest" },
    }),
    enabled: open && Boolean(workspace),
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = q.trim().toLowerCase().replace(/^#/, "");
  const [debouncedNeedle, setDebouncedNeedle] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedNeedle(needle), 400);
    return () => clearTimeout(t);
  }, [needle]);
  const issueHits = useQuery({
    ...trpc.issue.search.queryOptions({
      workspaceId: workspace?.id ?? "",
      q: debouncedNeedle,
    }),
    enabled: open && Boolean(workspace) && debouncedNeedle.length >= 3,
    retry: false,
    staleTime: 60_000,
  });
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);
  const actions: Item[] =
    canCreate && match("new issue create")
      ? [
          {
            key: "new-issue",
            group: "Actions",
            label: "New issue",
            hint: "C",
            run: () => openIssue({ source: "palette" }),
            icon: PlusSignIcon,
          },
        ]
      : [];
  const pages: Item[] = PAGES.filter((p) =>
    match(`${p.label} ${p.keys ?? ""}`),
  ).map((p) => ({
    key: p.href,
    group: "Pages",
    ...p,
  }));
  const prs: Item[] = (board.data?.cards ?? [])
    .filter((c) => match(`${c.number} ${c.title} ${c.repo}`))
    .slice(0, 8)
    .map((c) => ({
      key: `${c.repo}#${c.number}`,
      group: "Pull requests",
      label: c.title,
      hint: `${c.repo.split("/").pop()} #${c.number}`,
      href: `/review/${c.repo}/${c.number}`,
      icon: GitPullRequestIcon,
    }));
  const issues: Item[] =
    needle.length >= 3 && debouncedNeedle === needle
      ? (issueHits.data ?? []).map((i) => ({
          key: `issue:${i.repo}#${i.number}`,
          group: "Issues" as const,
          label: i.title,
          hint: `${i.repo.split("/").pop()} #${i.number}`,
          run: () => router.push(`/issues/${i.repo}/${i.number}`),
          icon: AlertCircleIcon,
        }))
      : [];
  // PRs first once the person is typing; pages first when browsing.
  const items = needle
    ? [...actions, ...prs, ...issues, ...pages]
    : [...actions, ...pages.slice(0, 6), ...prs];

  function go(item: Item) {
    setOpen(false);
    if (item.run) item.run();
    else router.push(item.href!);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Go to"
      description="Search pages, pull requests, and issues."
    >
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder="Search pages and pull requests…"
      />
      <CommandList>
        <CommandEmpty>
          No results. Try a page name, PR title or number.
        </CommandEmpty>
        {(["Actions", "Pages", "Pull requests", "Issues"] as const).map(
          (group) => (
            <CommandGroup key={group} heading={group}>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <CommandItem
                    key={item.key}
                    value={`${item.label} ${item.hint ?? ""}`}
                    onSelect={() => go(item)}
                  >
                    <HugeiconsIcon icon={item.icon} size={16} />
                    {item.label}
                    {item.hint && (
                      <CommandShortcut>{item.hint}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          ),
        )}
      </CommandList>
    </CommandDialog>
  );
}
