// Minimal adaptation of https://www.shadcnblocks.com/r/hero115.json.
import type { ReactNode } from "react";

export function Hero115({
  action,
  notice,
}: {
  action: ReactNode;
  notice: string | null;
}) {
  return (
    <section
      className="flex min-h-svh items-center justify-center px-6 py-16"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 100%, color-mix(in oklab, var(--color-accent-100) 45%, transparent), transparent 70%)",
      }}
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-display-4-semibold text-balance md:text-display-2-semibold">
          Review your GitHub pull requests in one place.
        </h1>
        <p className="max-w-xl text-title-3-regular text-balance text-text-secondary">
          See what needs review, understand the changes, and leave comments or
          approvals that post back to GitHub.
        </p>
        <div className="w-full pt-2 sm:w-auto">{action}</div>
        {notice && (
          <p role="status" className="text-body-regular text-text-secondary">
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
