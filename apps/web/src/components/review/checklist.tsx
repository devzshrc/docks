"use client";

import { Checkbox } from "@/components/ui-compat/controls";
import { answerStillValid } from "@/lib/checklist";
import type { Guide } from "@docks/api";
import { IconFileCode } from "@tabler/icons-react";
import { useReviewSession } from "@/hooks/use-review-session";

import { Count, DrawTick, useJustBecame } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * Reviewer checklist questions linked to files (§5.3). Ticks are a personal
 * aid synchronized privately, per commit; they're never posted to GitHub.
 */
export function Checklist({
  items,
  storageKey,
}: {
  items: Guide["checklist"];
  storageKey: string;
}) {
  const session = useReviewSession();
  const ids = items.map((item) => JSON.stringify([item.question, item.files]));
  const revision = `${storageKey}:${JSON.stringify(ids)}`;
  const answers = session.data.checklist.answers ?? {};
  const validAnswer = (id: string, files: string[]) => {
    const answer = answers[id];
    if (!answer)
      return (
        session.data.checklist.revision === revision &&
        session.data.checklist.checked.includes(id)
      );
    return answerStillValid(
      answer,
      files,
      session.headSha,
      session.fileShas,
      session.paid,
    );
  };
  const done = ids.flatMap((id, i) =>
    validAnswer(id, items[i]!.files) ? [i] : [],
  );
  function toggle(i: number) {
    const id = ids[i]!;
    const checked = done.includes(i);
    session.update((state) => {
      const next = { ...(state.checklist.answers ?? {}) };
      if (checked) delete next[id];
      else
        next[id] = {
          headSha: session.headSha,
          files: Object.fromEntries(
            items[i]!.files.map((path) => [path, session.fileShas[path] ?? ""]),
          ),
        };
      // Remove entries for questions no longer present in this guide.
      for (const key of Object.keys(next))
        if (!ids.includes(key)) delete next[key];
      return {
        ...state,
        checklist: {
          revision,
          checked: checked
            ? ids.filter((key, j) => j !== i && done.includes(j))
            : [...ids.filter((key, j) => done.includes(j)), id],
          answers: next,
        },
      };
    });
  }

  const complete = items.length > 0 && done.length === items.length;
  const justDone = useJustBecame(complete);
  if (!items.length) return null;

  return (
    <section aria-labelledby="checklist-heading" className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            id="checklist-heading"
            className="text-sm font-semibold"
          >
            Before you approve
          </h3>
          <span
            className={cn("text-xs tabular-nums",
              complete
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          >
            {complete ? (
              <span className="inline-flex items-center gap-1">
                <DrawTick className="size-3.5" /> All checked
              </span>
            ) : (
              <>
                <Count value={done.length} /> of {items.length}
              </>
            )}
          </span>
        </div>
        <div className="bg-muted h-1 overflow-hidden rounded-sm" aria-hidden>
          <div
            className={cn("h-full rounded-sm transition-[width,background-color] duration-300",
              complete ? "bg-emerald-500" : "bg-primary",
              justDone && "anim-pulse-once",
            )}
            style={{ width: `${(done.length / items.length) * 100}%` }}
          />
        </div>
      </div>

      <ul className="-mx-2 space-y-0.5">
        {items.map((item, i) => {
          const checked = done.includes(i);
          return (
            <li key={i}>
              {/* The whole row is the hit target; file links inside don't toggle it. */}
              <Checkbox
                aria-label={item.question}
                isSelected={checked}
                onChange={() => toggle(i)}
                className="hover:bg-muted/70 flex cursor-pointer gap-3 rounded-md px-2 py-2.5 transition-colors"
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span
                    className={cn("block text-[13.5px] leading-relaxed transition-colors",
                      checked ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {item.question}
                    {!checked && answers[ids[i]!]?.headSha && (
                      <span className="ml-2 text-xs text-warning">
                        Needs another check
                      </span>
                    )}
                  </span>
                  {item.files.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {item.files.map((f) => (
                        <a
                          key={f}
                          href={`#file-${f}`}
                          title={f}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-muted text-muted-foreground hover:text-foreground hover:bg-accent inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-code text-[11px] transition-colors"
                        >
                          <IconFileCode
                            className="size-3 shrink-0"
                            aria-hidden
                          />
                          <span className="truncate">{f.split("/").pop()}</span>
                        </a>
                      ))}
                    </span>
                  )}
                </span>
              </Checkbox>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
