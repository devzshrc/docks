"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";

function PostHogIdentity() {
  const { data: session, isPending } = useSession();
  const identifiedUser = useRef<string | null>(null);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || isPending) return;
    const user = session?.user;
    if (user) {
      if (identifiedUser.current !== user.id) {
        posthog.identify(user.id, { email: user.email, name: user.name });
        identifiedUser.current = user.id;
      }
    } else if (identifiedUser.current || posthog.get_property("$user_id")) {
      posthog.reset();
      identifiedUser.current = null;
    }
  }, [session?.user, isPending]);
  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogIdentity />
      {children}
    </PHProvider>
  );
}
