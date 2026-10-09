import { RiCheckLine } from "@remixicon/react";
import type { ReactNode } from "react";

import { PLANS, TEAM_PRICE } from "@/components/marketing/plans";
import { cx } from "@/utils/cx";

/**
 * A plan on the night surface: hairline glass, light type. Team is picked out by a thin sky edge and a
 * soft glow from above rather than a solid slab, so the pair stays airy.
 */
export function PlanTile({
  plan,
  action,
  price,
  note,
  footer,
  className,
}: {
  plan: "free" | "team";
  action: ReactNode;
  price?: ReactNode;
  note?: ReactNode;
  /** Pinned to the bottom of the card, under the feature list. */
  footer?: ReactNode;
  className?: string;
}) {
  const p = PLANS[plan];
  const team = plan === "team";
  return (
    <div className={cx("group/plan relative isolate rounded-[26px] p-px", team ? "bg-gradient-to-b from-sky-300/45 via-sky-400/10 to-white/[0.06]" : "bg-white/[0.08]", className)}>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[25px] bg-[#07090c] p-7 md:p-9">
        {team && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-80 transition-opacity duration-700 group-hover/plan:opacity-100"
            style={{ background: "radial-gradient(70% 100% at 50% 0%, rgb(3 105 161 / 0.32), transparent 72%)" }}
          />
        )}
        <div className="relative flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-medium tracking-[-0.01em] text-white/90">{p.name}</h3>
          {team && (
            <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-medium text-sky-200">For growing teams</span>
          )}
        </div>
        <div className="relative mt-7 flex items-baseline gap-2">
          {price ?? (
            <span className="text-[52px] leading-none font-light tracking-[-0.045em] text-white tabular-nums">
              <span className="me-0.5 align-top text-[22px] tracking-normal text-white/50">$</span>
              {team ? TEAM_PRICE : 0}
            </span>
          )}
          <span className="text-[13px] text-white/40">{team ? "per member / month" : "forever"}</span>
        </div>
        <p className="relative mt-3 text-[14.5px] leading-relaxed text-white/50">{p.blurb}</p>
        {note && <div className="relative mt-1 text-[13px] text-white/40">{note}</div>}
        <div className="relative mt-7">{action}</div>
        <div aria-hidden="true" className="relative mt-8 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
        <ul className="relative mt-7 grid gap-3.5 text-[14px]">
          {p.features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-white/70">
              <RiCheckLine aria-hidden="true" className={cx("mt-0.5 size-4 shrink-0", team ? "text-sky-300" : "text-white/35")} />
              {f}
            </li>
          ))}
        </ul>
        {footer && <div className="relative mt-auto pt-2">{footer}</div>}
      </div>
    </div>
  );
}
