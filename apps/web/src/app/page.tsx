import type { Metadata } from "next"

import { Landing } from "@/components/landing/landing"

export const metadata: Metadata = {
  title: "Docks — Guided code review for GitHub teams",
  description: "One board of what's waiting, a clear order for every change, and the context to decide with confidence.",
}

export default function Home() {
  return <Landing />
}
