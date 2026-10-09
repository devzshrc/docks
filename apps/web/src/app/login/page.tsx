import { AuthStage } from "@/components/auth-stage"
import { LoginForm } from "@/components/login-form"
import { RedirectIfAuthed } from "@/components/auth-guard"

export default function Page() {
  return (
    <RedirectIfAuthed>
      <AuthStage>
        <div data-auth>
          <LoginForm />
        </div>
      </AuthStage>
    </RedirectIfAuthed>
  )
}
