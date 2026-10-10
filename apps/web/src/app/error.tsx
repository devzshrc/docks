"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { QueryError } from "@/components/query-state";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY)
      posthog.captureException(error, { digest: error.digest });
  }, [error]);
  return (
    <QueryError
      error={{ message: "This page could not load. Please retry." }}
      onRetry={reset}
    />
  );
}
