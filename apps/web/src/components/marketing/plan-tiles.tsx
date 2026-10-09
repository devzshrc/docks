import { RiCheckLine } from "@remixicon/react";
import type { ReactNode } from "react";

import { PLANS, TEAM_PRICE } from "@/components/marketing/plans";
import { cn } from "@/lib/utils";

/** Free is a quiet gray tile; Team is graphite with a soft light along its top edge. */
export function PlanTile({
  plan,
  action,
  price,
  note,
  className,
}: {
  plan: "free" | "team";
  action: ReactNode;
  price?: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  const p = PLANS[plan];
  const dark = plan === "team";
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[28px] p-7 md:p-9",
        dark
          ? "bg-[#111113] text-white shadow-[0_40px_80px_-30px_rgb(17_17_19/0.55)]"
          : "bg-[#f4f4f5] text-[#111113]",
        className,
      )}
    >
      {dark && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56" style={{ background: "radial-gradient(70% 100% at 50% 0%, rgb(124 107 255 / 0.28), transparent 70%)" }} />
          <div aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </>
      )}
      <div className="relative flex items-center justify-between gap-3">
        <h3 className="text-[19px] font-semibold tracking-[-0.025em]">{p.name}</h3>
        {dark && (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-medium text-white/80 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]">
            For growing teams
          </span>
        )}
      </div>
      <p className={cn("relative mt-1.5 text-[15px]", dark ? "text-white/55" : "text-[#6b6b70]")}>{p.blurb}</p>
      <div className="relative mt-8 flex items-baseline gap-2">
        {price ?? (
          <span className="text-[56px] leading-none font-semibold tracking-[-0.05em] tabular-nums">
            ${plan === "team" ? TEAM_PRICE : 0}
          </span>
        )}
        <span className={cn("text-[14px]", dark ? "text-white/50" : "text-[#8b8b92]")}>
          {plan === "team" ? "per member / month" : "forever"}
        </span>
      </div>
      {note && <div className={cn("relative mt-2 text-[13px]", dark ? "text-white/50" : "text-[#8b8b92]")}>{note}</div>}
      <div className="relative mt-7">{action}</div>
      <ul className="relative mt-8 grid gap-3.5 text-[14.5px]">
        {p.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full", dark ? "bg-white/12 text-white" : "bg-[#111113]/[0.07] text-[#111113]")}>
              <RiCheckLine className="size-3" />
            </span>
            <span className={dark ? "text-white/85" : "text-[#3f3f46]"}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
