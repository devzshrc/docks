import { redirect } from "next/navigation"

/** /settings has no page of its own: it opens the first tab. */
export default function Page() {
  redirect("/settings/workspace")
}
