"use client";

import { useState } from "react";
import { avatarSources } from "@/components/person-avatar";
import { cn } from "@/lib/utils";

export type Presence = "available" | "busy" | "away";

const DOT: Record<Presence, string> = {
  available: "bg-status",
  busy: "bg-warning",
  away: "bg-faint",
};

/** A larger avatar with the same fallback chain as PersonAvatar, plus an optional presence dot. */
export function Face({
  seed,
  name,
  src,
  githubLogin,
  presence,
  className,
}: {
  seed: string;
  name: string;
  src?: string | null;
  githubLogin?: string | null;
  presence?: Presence;
  className?: string;
}) {
  const chain = avatarSources(seed, src, githubLogin);
  const [step, setStep] = useState(0);
  return (
    <span className={cn("relative inline-flex size-11 shrink-0", className)}>
      {step < chain.length ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chain[step]}
          alt=""
          onError={() => setStep((n) => n + 1)}
          className="size-full rounded-full bg-muted object-cover shadow-[0_0_0_1px_rgb(15_23_42/0.08),0_1px_2px_rgb(15_23_42/0.08)]"
        />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {presence && (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-[28%] min-h-2 min-w-2 rounded-full ring-2 ring-card",
            DOT[presence],
          )}
          aria-hidden
        />
      )}
    </span>
  );
}
