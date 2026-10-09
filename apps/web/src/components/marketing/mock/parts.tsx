import { cn } from "@/lib/utils";

/** Static stand-ins for the app's own pieces, drawn in the dark CRM palette for the marketing mockups. */

export const PEOPLE = {
  dana: { name: "Dana Kim", initials: "DK", hue: "from-[#f9a8d4] to-[#c084fc]" },
  raj: { name: "Raj Patel", initials: "RP", hue: "from-[#fdba74] to-[#f97316]" },
  mei: { name: "Mei Chen", initials: "MC", hue: "from-[#86efac] to-[#14b8a6]" },
  leo: { name: "Leo Grant", initials: "LG", hue: "from-[#93c5fd] to-[#6366f1]" },
  sam: { name: "Sam Ortiz", initials: "SO", hue: "from-[#fde68a] to-[#f59e0b]" },
  ivy: { name: "Ivy Novak", initials: "IN", hue: "from-[#a5f3fc] to-[#0ea5e9]" },
  bot: { name: "dependabot", initials: "DB", hue: "from-[#cbd5e1] to-[#64748b]" },
} as const;
export type Person = keyof typeof PEOPLE;

export function Face({ who, className }: { who: Person; className?: string }) {
  const p = PEOPLE[who];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[7px] font-semibold text-black/70 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]",
        p.hue,
        className,
      )}
    >
      {p.initials}
    </span>
  );
}

const TONES = {
  blue: "border-(--tag-blue-border) bg-(--tag-blue-bg) text-(--tag-blue-text)",
  purple: "border-(--tag-purple-border) bg-(--tag-purple-bg) text-(--tag-purple-text)",
  green: "border-(--tag-green-border) bg-(--tag-green-bg) text-(--tag-green-text)",
  red: "border-(--tag-red-border) bg-(--tag-red-bg) text-(--tag-red-text)",
  orange: "border-(--tag-orange-border) bg-(--tag-orange-bg) text-(--tag-orange-text)",
  amber: "border-(--tag-amber-border) bg-(--tag-amber-bg) text-(--tag-amber-text)",
  teal: "border-(--tag-teal-border) bg-(--tag-teal-bg) text-(--tag-teal-text)",
  neutral: "border-(--tag-neutral-border) bg-(--tag-neutral-bg) text-(--tag-neutral-text)",
} as const;
export type Tone = keyof typeof TONES;

export function Tag({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[20px] shrink-0 items-center rounded-full border px-1.5 text-[11.5px] leading-none whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** The CRM segment meter: red, then amber, then green as it fills. */
export function Segments({ percent, segments = 14, className }: { percent: number; segments?: number; className?: string }) {
  const filled = Math.round((percent / 100) * segments);
  return (
    <span aria-hidden className={cn("flex h-3 items-center gap-[2px] rounded-[2px] bg-(--mk-raise) px-[2px]", className)}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 flex-1 rounded-[1px] transition-colors duration-500",
            i >= filled
              ? "bg-(--mk-track)"
              : i < Math.floor(filled / 3)
                ? "bg-[#f97373]"
                : i < Math.floor(filled / 3) + Math.ceil(filled / 3)
                  ? "bg-[#fbbf24]"
                  : "bg-[#22c55e]",
          )}
        />
      ))}
    </span>
  );
}

export function Spark({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values);
  return (
    <span aria-hidden className={cn("flex h-3.5 items-end gap-[2px]", className)}>
      {values.map((v, i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px]", i === values.length - 1 ? "bg-[#22c55e]" : "bg-[#22c55e]/45")} style={{ height: `${Math.max(14, (v / max) * 100)}%` }} />
      ))}
    </span>
  );
}

export function Count({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-4 min-w-6 items-center justify-center rounded-full border-[0.5px] border-(--mk-tagb) bg-(--mk-raise) px-1 text-[10.5px] leading-none text-(--mk-chip) shadow-[0_0_0_0.5px_#0e0e0e]", className)}>
      {children}
    </span>
  );
}

export function TrafficLights() {
  return (
    <span aria-hidden className="flex gap-1.5">
      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
      <span className="size-2.5 rounded-full bg-[#febc2e]" />
      <span className="size-2.5 rounded-full bg-[#28c840]" />
    </span>
  );
}

export const CONTROL = "shadow-control";
export const CARD = "shadow-card";
export const PRIMARY =
  "bg-[#4124fb] text-white shadow-[0_4px_4px_rgb(42_42_42/0.32),0_0_0_1px_#0e0e0e,inset_0_4px_6px_rgb(255_255_255/0.2),inset_0_0_0_1px_rgb(255_255_255/0.15),inset_0_-8px_14px_rgb(0_0_0/0.15)]";
