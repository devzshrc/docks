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
    <section className="quiet-gradient flex min-h-svh items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-display-4-medium text-balance tracking-tight md:text-display-2-medium">
          Review your GitHub pull requests in one place.
        </h1>
        <p className="max-w-xl text-headline-regular text-balance text-text-secondary md:text-title-3-regular">
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
