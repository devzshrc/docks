"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Frame } from "@/components/ui-compat/frame";
import { Kbd } from "@/components/ui/kbd";

import { IssueRow } from "@/components/issues/issue-row";
import { AssigneeMenu, LabelMenu } from "@/components/issues/pickers";
import type { IssueItem } from "@/components/issues/shared";
import { useIssueActions } from "@/components/issues/use-issue-actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const key = (i: IssueItem) => `${i.repo}#${i.number}`;
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * Issues as rows, with selection and bulk actions. Keys: j/k move, x selects, e closes,
 * a assigns, l labels, Esc clears. (`c` is the app-wide "new issue".)
 */
export function IssueList({
  items,
  loading,
  canAct,
  triage,
  closedView,
  me,
  empty,
}: {
  items: IssueItem[] | undefined;
  loading: boolean;
  canAct: boolean;
  triage: boolean;
  closedView: boolean;
  me: string | null;
  empty: React.ReactNode;
}) {
  const { bulk } = useIssueActions();
  const root = useRef<HTMLUListElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  // A refreshed list can drop issues (closed, reassigned); forget selections that no longer exist.
  const present = useMemo(() => new Set((items ?? []).map(key)), [items]);
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((k) => present.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [present]);

  const chosen = (items ?? []).filter((i) => selected.has(key(i)));
  const repos = new Set(chosen.map((i) => i.repo));
  const sameRepo = repos.size === 1 ? [...repos][0] : undefined;
  const refs = (list: IssueItem[]) =>
    list.map((i) => ({ repo: i.repo, number: i.number }));

  const toggle = (i: IssueItem) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key(i))) next.delete(key(i));
      else next.add(key(i));
      return next;
    });

  const stateRef = useRef({ items, selected, focusKey, canAct });
  stateRef.current = { items, selected, focusKey, canAct };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const {
        items: list = [],
        selected: sel,
        focusKey: fk,
        canAct: can,
      } = stateRef.current;
      const links = [
        ...(root.current?.querySelectorAll<HTMLAnchorElement>("a[data-row]") ??
          []),
      ];
      const idx = Math.max(
        0,
        list.findIndex((i) => key(i) === fk),
      );
      const focusAt = (n: number) => {
        const i = list[n];
        if (!i) return;
        setFocusKey(key(i));
        links[n]?.focus();
      };
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        focusAt(
          fk === null
            ? 0
            : e.key === "j"
              ? Math.min(idx + 1, list.length - 1)
              : Math.max(idx - 1, 0),
        );
      } else if (e.key === "Escape" && sel.size) {
        setSelected(new Set());
      } else if (
        can &&
        fk &&
        (e.key === "x" || e.key === "e" || e.key === "a" || e.key === "l")
      ) {
        const cur = list.find((i) => key(i) === fk);
        if (!cur) return;
        e.preventDefault();
        if (e.key === "x")
          return setSelected((s) => {
            const n = new Set(s);
            n.has(fk) ? n.delete(fk) : n.add(fk);
            return n;
          });
        // The other keys act on the selection, or on the focused row when nothing is selected.
        const targets = sel.size ? list.filter((i) => sel.has(key(i))) : [cur];
        if (!sel.size) setSelected(new Set([fk]));
        if (e.key === "e")
          bulk.mutate({
            items: refs(targets),
            action: { type: "close", reason: "completed" },
          });
        if (e.key === "a") setAssignOpen(true);
        if (e.key === "l") setLabelOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulk]);

  if (loading) {
    return (
      <div className="bg-card shadow-card divide-y overflow-hidden rounded-xl">
        {[0, 1, 2, 3, 4].map((n) => (
          <Skeleton
            key={n}
            className="border-hairline h-[68px] w-full rounded-none border-b"
          />
        ))}
      </div>
    );
  }
  if (!items?.length) return <>{empty}</>;

  return (
    <div className="space-y-3">
      {canAct && chosen.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="bg-card border-hairline sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-sm"
        >
          <span className="font-medium tabular-nums">
            {chosen.length} selected
          </span>
          <span className="bg-hairline h-4 w-px" aria-hidden />
          {closedView ? (
            <Button
              size="sm"
              variant="outline"
              disabled={bulk.isPending}
              onClick={() =>
                bulk.mutate({ items: refs(chosen), action: { type: "reopen" } })
              }
            >
              Reopen
            </Button>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={bulk.isPending}>
                    Close
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() =>
                      bulk.mutate({
                        items: refs(chosen),
                        action: { type: "close", reason: "completed" },
                      })
                    }
                  >
                    Close as completed
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      bulk.mutate({
                        items: refs(chosen),
                        action: { type: "close", reason: "not_planned" },
                      })
                    }
                  >
                    Close as not planned
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <AssigneeMenu
                repo={sameRepo}
                current={[]}
                me={me}
                open={assignOpen}
                onOpenChange={setAssignOpen}
                onChange={(next) =>
                  next[0] &&
                  bulk.mutate({
                    items: refs(chosen),
                    action: { type: "assign", login: next[0] },
                  })
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sameRepo || bulk.isPending}
                  title={
                    sameRepo
                      ? undefined
                      : "Select issues from one repository to assign"
                  }
                >
                  Assign
                </Button>
              </AssigneeMenu>
              <LabelMenu
                repo={sameRepo}
                current={[]}
                open={labelOpen}
                onOpenChange={setLabelOpen}
                onChange={(next) =>
                  next[0] &&
                  bulk.mutate({
                    items: refs(chosen),
                    action: { type: "label", label: next[0] },
                  })
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sameRepo || bulk.isPending}
                  title={
                    sameRepo
                      ? undefined
                      : "Select issues from one repository to label"
                  }
                >
                  Label
                </Button>
              </LabelMenu>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}
      <Frame spacing="xs" className="gap-0 overflow-hidden py-0">
        <ul ref={root} className="divide-y">
          {items.map((i) => (
            <IssueRow
              key={key(i)}
              issue={i}
              selected={selected.has(key(i))}
              focused={focusKey === key(i)}
              onToggle={() => toggle(i)}
              canAct={canAct}
              triage={triage}
              me={me}
            />
          ))}
        </ul>
      </Frame>
      {canAct && (
        <p className="text-text-3 hidden text-xs md:block">
          <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>x</Kbd> select · <Kbd>e</Kbd>{" "}
          close · <Kbd>a</Kbd> assign · <Kbd>l</Kbd> label
        </p>
      )}
    </div>
  );
}
