"use client";
import { Button as ShadcnButton } from "@/components/ui/button";

import type { RankedFile } from "@docks/api";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { ScrollFade } from "@/components/scroll-fade";
import { FileIcon } from "@/components/file-icon";
import { Collapse } from "@/components/motion";
import { cx as cn } from "@/utils/cx";

function Row({ f, showDir }: { f: RankedFile; showDir: boolean }) {
  const parts = f.filename.split("/");
  const name = parts.pop();
  const dir = parts.join("/");
  const settled = f.viewed && !f.changedSinceViewed;
  return (
    <a
      href={`#file-${f.filename}`}
      title={f.filename}
      className={cn(
        "hover:bg-muted/70 flex items-center gap-2.5 rounded-lg px-2 py-2.5 transition-colors",
        f.tier === "noise" && "opacity-60",
      )}
    >
      <FileIcon path={f.filename} className={cn(settled && "opacity-50")} />
      <span className="min-w-0 flex-1 leading-tight">
        <span
          className={cn(
            "font-code block truncate text-[12.5px]",
            settled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {name}
        </span>
        {showDir && dir && (
          <span className="text-muted-foreground block truncate text-[11px]">
            {dir}
          </span>
        )}
      </span>
      <span className="font-code flex shrink-0 items-center gap-1.5 text-[10.5px] tabular-nums">
        {f.changedSinceViewed ? (
          <span className="rounded bg-amber-500/15 px-1 py-px text-amber-700 dark:text-amber-400">
            changed
          </span>
        ) : f.viewed ? (
          <HugeiconsIcon
            icon={Tick02Icon}
            size={14}
            className="animate-in zoom-in-50 fade-in text-emerald-600 duration-200 dark:text-emerald-400"
            aria-label="Viewed"
          />
        ) : (
          <>
            {f.additions > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                +{f.additions}
              </span>
            )}
            {f.deletions > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                −{f.deletions}
              </span>
            )}
          </>
        )}
      </span>
    </a>
  );
}

/** Files of the PR. Small PRs: a flat list. Bigger ones: grouped by folder, each group collapsible. */
export function FileRail({ files }: { files: RankedFile[] }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = new Map<string, RankedFile[]>();
  for (const f of files) {
    const dir = f.filename.includes("/")
      ? f.filename.slice(0, f.filename.lastIndexOf("/"))
      : "";
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  const grouped = files.length > 8 && groups.size > 1;

  return (
    <nav aria-label="Files" className="-mx-2">
      <ScrollFade className="max-h-[60vh]">
        {grouped ? (
          <div className="space-y-1">
            {[...groups].map(([dir, list]) => {
              const done = list.filter(
                (f) => f.viewed && !f.changedSinceViewed,
              ).length;
              const open = !closed[dir];
              return (
                <div key={dir}>
                  <ShadcnButton
                    variant="row"
                    size="none"
                    type="button"
                    aria-expanded={open}
                    onClick={() => setClosed((c) => ({ ...c, [dir]: open }))}
                    className="hover:bg-muted/70 text-muted-foreground flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] transition-colors"
                  >
                    <span
                      className={cn(
                        "inline-block transition-transform duration-150",
                        open && "rotate-90",
                      )}
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="font-code min-w-0 flex-1 truncate">
                      {dir || "(root)"}
                    </span>
                    <span className="tabular-nums">
                      {done}/{list.length}
                    </span>
                  </ShadcnButton>
                  <Collapse open={open}>
                    <ol className="space-y-px pl-3">
                      {list.map((f) => (
                        <li key={f.filename}>
                          <Row f={f} showDir={false} />
                        </li>
                      ))}
                    </ol>
                  </Collapse>
                </div>
              );
            })}
          </div>
        ) : (
          <ol className="space-y-px">
            {files.map((f) => (
              <li key={f.filename}>
                <Row f={f} showDir />
              </li>
            ))}
          </ol>
        )}
      </ScrollFade>
    </nav>
  );
}
