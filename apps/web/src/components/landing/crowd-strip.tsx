"use client";

import { CrowdCanvas, type CrowdCastMember } from "@/components/ui/skiper39";
import { cx } from "@/utils/cx";

// Cells index the 15 × 7 Open Peeps sprite, left to right, top to bottom.
const CAST: CrowdCastMember[] = [
  { cell: 6, name: "Arjun", call: true, line: "Haan Ma, home by six. My review queue is already empty." },
  { cell: 9, name: "Ananya", call: true, line: "I was on leave, so Docks gave my review to Kabir. Nothing slipped." },
  { cell: 11, name: "Ishaan", line: "j, k, e. Inbox zero before chai." },
  { cell: 12, name: "Harpreet", line: "Time to first review went from 19 hours to 3. Not bad, na?" },
  { cell: 15, name: "Dev", call: true, line: "Yes, I'm on it. It's literally first in my queue." },
  { cell: 31, name: "Vikram", call: true, line: "My review deadline paused for Sunday. Finally, a tool that respects weekends." },
  { cell: 35, name: "Zoya", line: "The merge blocker was one failing check. Docks said so upfront." },
  { cell: 36, name: "Kabir", call: true, line: "Picked up Ananya's review. Docks chose me because I wrote that code." },
  { cell: 45, name: "Rohan", call: true, line: "Bhai, no more 'PR dekh lo' on Slack. Docks nudges for me." },
  { cell: 48, name: "Tanvi", line: "Forty files, read in the order they were written. Like a story." },
  { cell: 49, name: "Neel", call: true, line: "Sent my review notes to Claude Code. The fix is already pushed." },
  { cell: 54, name: "Meera", call: true, line: "Second pass? Only 3 files changed since my last review." },
  { cell: 58, name: "Aditya", call: true, line: "Release is 8 of 10 merged. We ship tonight." },
  { cell: 59, name: "Lakshmi", line: "Every PR gets our team checklist. No more 'did you test this?'" },
  { cell: 4, name: "Bittu", call: true, line: "Arre Bittu here. Review aaya, order mein padha, merge ho gaya. Chai bhi garam hai." },
  { cell: 0, name: "Vaishnavi", line: "Checklist ne pehle hi pakad liya. Missing test, before anyone asked." },
  { cell: 22, name: "Harsh", call: true, line: "Haan boss, backup reviewer ban gaya. Docks ne khud poocha, no Slack chasing." },
  { cell: 24, name: "Ankit", line: "Friday 6pm? Deadline paused till Monday. Weekend bach gaya." },
  { cell: 26, name: "Keval", call: true, line: "Hello? Haan, release readiness green hai. Aaj raat ship kar rahe hain." },
  { cell: 68, name: "Arzu", imageSrc: "/landing/arzu.png", call: true, line: "Haan, bas merge hone wala hai. Docks ne bola, sab checks green hain." },
  { cell: 40, name: "Sai", line: "Review order follow kiya, aur bina confusion ke approve. Mast hai." },
  { cell: 64, name: "Harshwardhan", call: true, line: "Sab kuch ek queue mein hai. Ab kisi ko ping nahi karna padta, bas ship karna hai." },
  { cell: 69, name: "Sneha", call: true, line: "Got a nudge before my review went late, not after." },
];

// Sprite cells that hold a knife. Not the mood for a code review.
const LEFT_OUT = [17, 72, 92, 100];

export function CrowdStrip({ className }: { className?: string }) {
  return (
    <div className={cx("relative h-[300px] sm:h-[360px] lg:h-[400px]", className)}>
      <p className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-2 text-center text-caption-1-medium text-white/40 after:h-10 after:w-px after:bg-gradient-to-b after:from-white/30 after:to-transparent after:content-['']">
        <span className="tracking-[0.18em] uppercase">Meanwhile, on teams using Docks</span>
        <span className="text-white/30">
          <span className="pointer-coarse:hidden">Hover</span>
          <span className="hidden pointer-coarse:inline">Tap</span> a name tag to listen in
        </span>
      </p>
      <CrowdCanvas src="/landing/crowd-peeps.png" cast={CAST} exclude={LEFT_OUT} className="h-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black to-transparent" />
      <ul className="sr-only">
        {CAST.map((member) => (
          <li key={member.cell}>
            {member.name}: {member.line}
          </li>
        ))}
      </ul>
    </div>
  );
}
