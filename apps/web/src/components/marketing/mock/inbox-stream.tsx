"use client";

import { RiAtLine, RiCheckDoubleLine, RiErrorWarningFill, RiGitMergeLine, RiTimerFlashLine, RiUserReceived2Line } from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, useStoryboard } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

import { CARD, CONTROL, Face, Tag, type Person } from "./parts";

const ITEMS: { icon: typeof RiAtLine; tint: string; who?: Person; title: React.ReactNode; meta: string; quote?: string }[] = [
  { icon: RiUserReceived2Line, tint: "text-[#a397ff]", who: "mei", title: <><b className="font-medium">Mei</b> asked for your review</>, meta: "api #418 · Rate-limit login attempts" },
  { icon: RiErrorWarningFill, tint: "text-[#f97373]", title: <>Checks failed on <b className="font-medium">#415</b></>, meta: "web · Bump Next.js to 15.5" },
  { icon: RiAtLine, tint: "text-[#bfdbfe]", who: "raj", title: <><b className="font-medium">Raj</b> mentioned you</>, meta: "web #412", quote: "Can you check the empty state copy?" },
  { icon: RiTimerFlashLine, tint: "text-[#fbbf24]", title: <>Review due in <b className="font-medium">1 work hour</b></>, meta: "web #412 · Onboarding wizard v2" },
  { icon: RiGitMergeLine, tint: "text-[#22c55e]", who: "leo", title: <><b className="font-medium">#407</b> merged</>, meta: "docs · Search index for docs" },
];

const TIMELINE = [1000, 1000, 1000, 1500, 2000, 900];

/** Inbox: notifications arrive one by one, then everything is marked read. */
export function InboxStream() {
  const { ref, step } = useStoryboard(TIMELINE);
  const shown = Math.min(step + 2, ITEMS.length);
  const allRead = step >= 4;
  const visible = ITEMS.slice(0, shown).reverse();

  return (
    <div ref={ref} role="img" aria-label="Docks inbox: review requests, failed checks, mentions, deadlines and merges in one list" className="w-full max-w-[460px] overflow-hidden rounded-2xl bg-[#161616] text-[#f9fbff] shadow-[0_40px_80px_-24px_rgb(0_0_0/0.45),0_0_0_1px_rgb(0_0_0/0.9)]">
      <div className="flex items-center justify-between border-b border-[#232323] px-4 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-medium">
          Inbox
          <motion.span
            key={allRead ? "read" : shown}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-flex h-4 min-w-6 items-center justify-center rounded-full border-[0.5px] border-[#414141] bg-[#2a2a2a] px-1 text-[10.5px] text-[#cfcfcf]"
          >
            {allRead ? 0 : shown}
          </motion.span>
        </span>
        <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] leading-none transition-colors duration-300", CONTROL, allRead ? "bg-[#1f3a2d] text-[#b1ebc5]" : "bg-[#1e1e1e] text-[#cfcfcf]")}>
          <RiCheckDoubleLine className="size-3" />
          {allRead ? "All caught up" : "Mark all read"}
        </span>
      </div>
      <div className="flex h-[372px] flex-col gap-2 overflow-hidden p-3">
        <AnimatePresence initial={false}>
          {visible.map((it) => (
            <motion.div
              layout
              key={it.meta}
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: EASE }}
              className={cn("flex items-start gap-3 rounded-xl bg-[#1b1c1e] p-3", CARD)}
            >
              <span className="relative mt-0.5">
                {it.who ? <Face who={it.who} className="size-6 text-[8.5px]" /> : <span className="flex size-6 items-center justify-center rounded-full bg-[#2a2a2a]"><it.icon className={cn("size-3.5", it.tint)} /></span>}
                {it.who && (
                  <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-[#161616]">
                    <it.icon className={cn("size-2.5", it.tint)} />
                  </span>
                )}
              </span>
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="text-[12.5px] leading-snug text-[#d4d4d8] [&_b]:text-[#f9fbff]">{it.title}</span>
                <span className="truncate text-[11px] text-[#676767]">{it.meta}</span>
                {it.quote && <span className="mt-1 rounded-md border-l-2 border-[#393939] bg-[#232323] px-2 py-1.5 text-[11.5px] text-[#a4a4a4]">{it.quote}</span>}
              </span>
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6d5bff] transition-opacity duration-500", allRead && "opacity-0")} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2 border-t border-[#232323] px-4 py-2.5 text-[11px] text-[#676767]">
        <Tag>j</Tag><Tag>k</Tag> move <Tag className="ml-2">e</Tag> done
      </div>
    </div>
  );
}
