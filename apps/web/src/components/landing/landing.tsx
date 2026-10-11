"use client";

import { RiGithubFill } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Hero115 } from "@/components/landing/blocks/hero115";
import { useGithubStart } from "@/components/landing/use-github-start";
import { useSession } from "@/lib/auth-client";

export function Landing() {
  const { start, pending, notice } = useGithubStart();
  const { data } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (data?.user) router.replace("/review");
  }, [data, router]);

  return (
    <main className="min-h-svh bg-background-primary-default text-text-primary">
      <Hero115
        notice={notice}
        action={
          <Button
            size="lg"
            onClick={() => void start()}
            disabled={pending}
            aria-busy={pending}
            className="min-h-12 w-full px-6 shadow-none sm:w-auto"
          >
            <RiGithubFill className="size-5" aria-hidden />
            {pending ? "Connecting…" : "Start free with GitHub"}
          </Button>
        }
      />
    </main>
  );
}
