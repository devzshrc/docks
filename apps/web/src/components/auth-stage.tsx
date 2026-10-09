import Link from "next/link";

import { AppIcon } from "@/components/app-icon";
import { Grain } from "@/components/marketing/backdrop";

/** Signed-out pages: the form centered on a quiet stage, with a soft light from above. */
export function AuthStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-svh w-full flex-col items-center justify-center overflow-hidden px-6 py-20">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 45% at 50% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%), radial-gradient(35% 35% at 85% 10%, color-mix(in oklab, #ffb48a 10%, transparent), transparent 70%)",
        }}
      />
      <Grain opacity={0.04} className="-z-10 mix-blend-overlay" />
      <Link
        href="/"
        className="absolute top-5 left-6 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]"
      >
        <AppIcon className="size-7" />
        Docks
      </Link>
      <div className="animate-in fade-in slide-in-from-bottom-2 ease-power3-out w-full max-w-[400px] duration-500">
        {children}
      </div>
      <p className="text-subtle absolute bottom-6 text-xs">
        Guided code review for GitHub teams
      </p>
    </div>
  );
}
