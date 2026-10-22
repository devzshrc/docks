import type { Metadata, Viewport } from "next";

import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "Docks | Find and review GitHub pull requests",
  description:
    "Find GitHub pull requests waiting for your review. Read a summary, follow the changed files, and post comments or approvals from Docks.",
};

// viewport-fit=cover lets the landing paint under the notch; the header pads back out with env().
// The status bar follows the OS scheme here; the landing's own toggle is class-based, so it can differ.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#07080a" },
  ],
};

export default function Home() {
  return <Landing />;
}
