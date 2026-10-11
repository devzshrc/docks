import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One block of the review sidebar: a small label, an optional action, then content. Sections are split by hairlines. */
export function SideSection({
  label,
  action,
  className,
  children,
}: {
  label: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("grid gap-2.5 border-t pt-4 first:border-t-0 first:pt-0", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
