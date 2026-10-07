import { SignupForm } from "@/components/signup-form"
import { RedirectIfAuthed } from "@/components/auth-guard"

export default function Page() {
  return (
    <RedirectIfAuthed>
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div data-auth className="w-full max-w-[380px]">
          <SignupForm />
        </div>
      </div>
    </RedirectIfAuthed>
  )
}
