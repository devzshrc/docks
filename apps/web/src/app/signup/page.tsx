import { AuthStage } from "@/components/auth-stage"
import { SignupForm } from "@/components/signup-form"
import { RedirectIfAuthed } from "@/components/auth-guard"

export default function Page() {
  return (
    <RedirectIfAuthed>
      <AuthStage>
        <div data-auth>
          <SignupForm />
        </div>
      </AuthStage>
    </RedirectIfAuthed>
  )
}
