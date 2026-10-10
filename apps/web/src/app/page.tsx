import type { Metadata } from "next";

import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "Docks — Guided code review for GitHub teams",
  description:
    "See your GitHub pull requests in one place, understand the code changes, and leave comments or approvals.",
};

export default function Home() {
  return <Landing />;
}
