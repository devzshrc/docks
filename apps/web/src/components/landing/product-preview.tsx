import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LANES: {
  title: string;
  cards: {
    repo: string;
    title: string;
    who: string;
    chip?: { label: string; tone?: string };
    size: string;
  }[];
}[] = [
  {
    title: "Needs reviewer",
    cards: [
      {
        repo: "acme/web",
        title: "Bump Next.js to 15.5",
        who: "dependabot",
        chip: { label: "Stuck", tone: "warning" },
        size: "S +1 −1",
      },
    ],
  },
  {
    title: "Waiting on review",
    cards: [
      {
        repo: "acme/api",
        title: "Rate-limit login attempts",
        who: "dana",
        chip: { label: "security", tone: "info" },
        size: "M +158 −6",
      },
      {
        repo: "acme/web",
        title: "Onboarding wizard v2",
        who: "raj",
        size: "L +512 −88",
      },
    ],
  },
  {
    title: "Changes requested",
    cards: [
      {
        repo: "acme/api",
        title: "Cache invoice totals",
        who: "mei",
        size: "S +24 −3",
      },
    ],
  },
  {
    title: "Approved",
    cards: [
      {
        repo: "acme/docs",
        title: "Search index for docs",
        who: "mei",
        chip: { label: "Ready", tone: "success" },
        size: "S +2 −0",
      },
    ],
  },
];

/** A static, on-brand picture of the board: what the product looks like, drawn with the same tokens. */
export function ProductPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-background border-hairline relative overflow-hidden rounded-2xl border shadow-2xl shadow-black/20",
        className,
      )}
      role="img"
      aria-label="Docks board showing pull requests grouped by review state"
    >
      <div className="border-hairline flex h-10 items-center gap-2 border-b px-4">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="text-text-3 mx-auto text-[11px]">
          docks.app/review
        </span>
      </div>
      <div className="grid min-h-[320px] grid-cols-[148px_1fr] max-sm:grid-cols-1">
        <aside className="border-hairline bg-sidebar hidden border-r p-3 sm:block">
          <div className="mb-4 flex items-center gap-2">
            <span className="bg-foreground text-background flex size-5 items-center justify-center rounded-md text-[10px] font-medium">
              D
            </span>
            <span className="text-xs font-medium">Docks</span>
          </div>
          <p className="text-text-3 mb-1.5 text-[10px] tracking-[0.12em] uppercase">
            Review
          </p>
          {[
            ["Reviews", true],
            ["Insights", false],
            ["Team", false],
          ].map(([label, on]) => (
            <div
              key={String(label)}
              className={cn(
                "mb-0.5 flex h-7 items-center justify-between rounded-md px-2 text-xs",
                on
                  ? "bg-hover shadow-(--ring-raised) font-medium"
                  : "text-muted-foreground",
              )}
            >
              {label}
              {on && (
                <span className="bg-hover text-muted-foreground rounded px-1 text-[10px]">
                  1
                </span>
              )}
            </div>
          ))}
        </aside>
        <div className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {["Repository  All", "Author  Anyone", "Sort  Oldest first"].map(
              (t) => (
                <span
                  key={t}
                  className="tex-neutral text-muted-foreground inline-flex h-7 items-center rounded-full px-3 text-[11px]"
                >
                  {t}
                </span>
              ),
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {LANES.map((lane) => (
              <div key={lane.title} className="min-w-0 space-y-2">
                <p className="flex h-6 items-center gap-1.5 text-xs font-medium">
                  {lane.title}
                  <Badge
                    variant="secondary"
                    className=" h-4 px-1.5 text-[10px]"
                  >
                    {lane.cards.length}
                  </Badge>
                </p>
                {lane.cards.map((c) => (
                  <div
                    key={c.title}
                    className="bg-card border-hairline rounded-xl border p-2.5"
                  >
                    <p className="text-muted-foreground font-mono text-[10px]">
                      {c.repo}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug font-medium">
                      {c.title}
                    </p>
                    <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[10px]">
                      <span className="bg-hover size-3.5 rounded-full" />
                      {c.who}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge
                        variant="secondary"
                        className=" h-[18px] px-1.5 text-[10px]"
                      >
                        {c.size}
                      </Badge>
                      {c.chip && (
                        <Badge
                          variant="secondary"
                          className=" h-[18px] px-1.5 text-[10px]"
                          data-tone={c.chip.tone}
                        >
                          {c.chip.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
