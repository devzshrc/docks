import { RiGitPullRequestLine, RiInbox2Line, RiTimeLine, RiUser3Line } from "@remixicon/react";

const TABS = ["api#482", "web#1291", "infra#77"];
const NAV = [
  { icon: RiInbox2Line, label: "Needs review", count: 3, active: true },
  { icon: RiUser3Line, label: "My pull requests", count: 2 },
  { icon: RiTimeLine, label: "Snoozed", count: 1 },
];
const PRS = [
  { repo: "acme/api", title: "Rate-limit webhook retries", add: 84, del: 12, who: "Maya", tone: "#f59e0b", wait: "Waiting 2h" },
  { repo: "acme/web", title: "Move billing page to server components", add: 312, del: 198, who: "Leo", tone: "#2f7bf5", wait: "Your turn" },
  { repo: "acme/infra", title: "Pin Postgres to 16.4 in CI", add: 6, del: 2, who: "Sam", tone: "#10b981", wait: "Ready to merge" },
];

/** Static, decorative mock of the review inbox — mirrors /review, not a live render. */
export function ProductWindow() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[960px] select-none">
      <div className="overflow-hidden rounded-[20px] bg-white/70 p-1.5 shadow-[0_0_0_1px_rgb(11_11_12/0.06),0_30px_80px_-24px_rgb(30_60_110/0.35)] backdrop-blur">
        <div className="overflow-hidden rounded-[15px] bg-[#fbfbfa] ring-1 ring-black/5">
          {/* Chrome */}
          <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5">
            <div className="flex gap-1.5">
              {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="hidden gap-1.5 sm:flex">
              {TABS.map((t, i) => (
                <span key={t} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] ${i === 0 ? "bg-white text-[var(--l-ink)] shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" : "text-[var(--l-ink-3)]"}`}>
                  <RiGitPullRequestLine className="size-3" />
                  {t}
                </span>
              ))}
            </div>
            <div className="ml-auto flex h-6 flex-1 items-center rounded-md bg-black/[0.035] px-2.5 text-[11px] text-[var(--l-ink-3)] sm:max-w-[280px]">
              docks.devzshrc.in/review
            </div>
          </div>
          {/* Body */}
          <div className="grid min-h-[340px] grid-cols-1 sm:grid-cols-[200px_1fr]">
            <aside className="hidden border-r border-black/5 p-3 sm:block">
              <div className="mb-4 flex items-center gap-2 px-2">
                <span className="grid size-6 place-items-center rounded-md bg-[var(--l-ink)] text-[10px] font-semibold text-white">A</span>
                <div className="leading-tight">
                  <p className="text-[12px] font-medium">Acme</p>
                  <p className="text-[10px] text-[var(--l-ink-3)]">12 repositories</p>
                </div>
              </div>
              {NAV.map(({ icon: Icon, label, count, active }) => (
                <div key={label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${active ? "bg-white font-medium shadow-[0_0_0_1px_rgb(0_0_0/0.05)]" : "text-[var(--l-ink-2)]"}`}>
                  <Icon className="size-3.5" />
                  {label}
                  <span className="ml-auto text-[10px] text-[var(--l-ink-3)] tabular-nums">{count}</span>
                </div>
              ))}
            </aside>
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-baseline gap-2">
                <p className="text-[13px] font-medium">Needs review</p>
                <p className="text-[11px] text-[var(--l-ink-3)]">Ordered by who is waiting longest</p>
              </div>
              <div className="grid gap-2.5 md:grid-cols-3">
                {PRS.map((pr) => (
                  <div key={pr.title} className="flex flex-col gap-3 rounded-xl bg-white p-3.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--l-ink-3)]">{pr.repo}</span>
                      <span className="size-2 rounded-full" style={{ background: pr.tone }} />
                    </div>
                    <p className="text-[12.5px] leading-[17px] font-medium text-balance">{pr.title}</p>
                    <div className="mt-auto flex items-center justify-between text-[10.5px]">
                      <span className="font-mono tabular-nums">
                        <span className="text-[#16a34a]">+{pr.add}</span>{" "}
                        <span className="text-[#dc2626]">−{pr.del}</span>
                      </span>
                      <span className="text-[var(--l-ink-3)]">{pr.who} · {pr.wait}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-32 bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}
