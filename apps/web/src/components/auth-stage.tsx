import Link from "next/link";
import { AppIcon } from "@/components/app-icon";

export function AuthStage({ children }: { children: React.ReactNode }) {
  return (
    <main className="quiet-gradient relative isolate flex min-h-svh w-full flex-col items-center justify-center px-4 py-24 sm:px-6">
      <Link
        href="/"
        className="absolute start-6 top-6 flex items-center gap-2 text-body-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <AppIcon className="size-7" /> Docks
      </Link>
      <div className="w-full max-w-md" data-auth>
        {children}
      </div>
      <p className="mt-6 text-center text-caption-1-regular text-text-secondary">
        Your GitHub reviews, in one place.
      </p>
    </main>
  );
}
