import { redirect } from "next/navigation"

/** The starter dashboard was replaced by the review board. Kept for old links. */
export default function Page() {
  redirect("/review")
}
