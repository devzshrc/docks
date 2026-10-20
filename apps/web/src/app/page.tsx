import type { Metadata } from "next";

import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "Docks | Find and review GitHub pull requests",
  description:
    "Find GitHub pull requests waiting for your review. Read a summary, follow the changed files, and post comments or approvals from Docks.",
};

export default function Home() {
  return <Landing />;
}
