"use client";
import { Button as ShadcnButton } from "@/components/ui/button";


import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { GitHubSignIn } from "@/components/github-sign-in";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { cn, nextPath } from "@/lib/utils";

/** Keep ?next= when switching between login and signup (client-only, after hydration). */
function useWithNext(path: string) {
  const [href, setHref] = React.useState(path);
  React.useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) setHref(`${path}?next=${encodeURIComponent(next)}`);
  }, [path]);
  return href;
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const altHref = useWithNext("/signup");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [unverified, setUnverified] = React.useState(false);
  const [resent, setResent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    setUnverified(false);
    const { data, error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      if (error.status === 403) {
        setUnverified(true);
        return;
      }
      setError(error.message ?? "Sign-in failed");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    router.push(nextPath());
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="py-7 [&>[data-slot=card-content]]:px-7 [&>[data-slot=card-header]]:px-7">
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-[-0.03em]">Welcome back</CardTitle>
          <CardDescription>Sign in to keep reviewing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <GitHubSignIn />
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field>
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? "Logging in…" : "Login"}
                </Button>
                {error && <FieldError>{error}</FieldError>}
                {unverified && (
                  <FieldDescription>
                    Confirm your email first. We sent a link to {email}.{" "}
                    {resent ? (
                      "Sent again."
                    ) : (
                      <ShadcnButton
                        variant="ghost"
                        type="button"
                        className="underline underline-offset-4"
                        onClick={async () => {
                          await authClient.sendVerificationEmail({
                            email,
                            callbackURL: `${window.location.origin}${nextPath()}`,
                          });
                          setResent(true);
                        }}
                      >
                        Send it again
                      </ShadcnButton>
                    )}
                  </FieldDescription>
                )}
                <FieldDescription className="text-center">
                  Don&apos;t have an account?{" "}
                  <Link href={altHref} className="underline underline-offset-4">
                    Sign up
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
