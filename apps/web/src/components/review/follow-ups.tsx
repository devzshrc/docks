"use client";
import { errorMessage } from "@/lib/error-message";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
export function FollowUps({ repo, number }: { repo: string; number: number }) {
  const trpc = useTRPC();
  const q = useQuery({
    ...trpc.review.followUps.queryOptions({ repo, number }),
    refetchInterval: 30000,
  });
  return (
    <section className="flex flex-col gap-2" aria-label="Follow-up issues">
      <h3 className="text-headline-medium text-text-primary">
        Follow-up issues
      </h3>
      {q.isPending ? (
        <p>Loading follow-ups…</p>
      ) : q.error ? (
        <p role="alert" className="text-text-error-primary">
          {errorMessage(q.error)}
        </p>
      ) : !q.data?.length ? (
        <p className="text-body-regular text-text-secondary">
          Create a follow-up from a review thread or AI answer.
        </p>
      ) : (
        <ul>
          {q.data.map((r) => (
            <li key={r.link.id}>
              <a
                className="text-body-regular underline"
                href={`https://github.com/${r.repo}/issues/${r.link.issueNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                {r.title ?? `${r.repo} #${r.link.issueNumber}`}
              </a>
              <span className="text-caption-1-regular text-text-secondary">
                {" "}
                · {r.state ?? "Status awaiting sync"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
