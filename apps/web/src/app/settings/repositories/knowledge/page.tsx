"use client";
import { errorMessage } from "@/lib/error-message";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { useTRPC } from "@/trpc/react";
import { MarkdownPreview } from "@/components/review/markdown-preview";

type Category = "architecture" | "conventions" | "testing" | "review";
type Draft = {
  id?: string;
  expectedVersion?: number;
  title: string;
  category: Category;
  body: string;
  archived: boolean;
};
const empty: Draft = {
  title: "",
  category: "architecture",
  body: "",
  archived: false,
};
function Knowledge() {
  const params = useSearchParams();
  const repo = params.get("repo") ?? "";
  const [historyId, setHistoryId] = useState<string | null>(
    params.get("document"),
  );
  const trpc = useTRPC();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const q = useQuery({
    ...trpc.knowledge.list.queryOptions({ repo, search, archived }),
    enabled: Boolean(repo),
  });
  const revisions = useQuery({
    ...trpc.knowledge.revisions.queryOptions({
      repo,
      id: draft?.id ?? historyId ?? "00000000-0000-0000-0000-000000000000",
    }),
    enabled: Boolean(draft?.id ?? historyId),
  });
  const save = useMutation(
    trpc.knowledge.save.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        await client.invalidateQueries(trpc.knowledge.pathFilter());
      },
    }),
  );
  return (
    <AppShell
      title="Repository knowledge"
      description={repo || "Choose Knowledge from repository settings."}
    >
      <div className="flex flex-col gap-4">
        <Input label="Search knowledge" value={search} onChange={setSearch} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setArchived((v) => !v)}>
            {archived ? "Show active" : "Show archived"}
          </Button>
          {q.data?.canEdit && (
            <Button onClick={() => setDraft({ ...empty })}>New document</Button>
          )}
        </div>
        {q.isPending && repo && <p role="status">Loading knowledge…</p>}
        {q.error && (
          <p role="alert" className="text-text-error-primary">
            {errorMessage(q.error)}
          </p>
        )}
        {q.data?.documents.length === 0 && <p>No documents yet.</p>}
        {q.data?.documents.map((d) => (
          <article
            key={d.id}
            className="flex flex-col gap-3 rounded-md border border-border-button-default p-4"
          >
            <h2 className="text-title-3-semibold text-text-primary">
              {d.title}
            </h2>
            <p className="text-caption-1-regular text-text-secondary">
              {d.category} · Revision {d.version} ·{" "}
              {d.updatedAt.toLocaleString()}
            </p>
            <MarkdownPreview text={d.body} />
            <Button variant="secondary" onClick={() => setHistoryId(d.id)}>
              History
            </Button>
            {q.data.canEdit && (
              <Button
                variant="secondary"
                onClick={() =>
                  setDraft({
                    id: d.id,
                    expectedVersion: d.version,
                    title: d.title,
                    category: d.category as Category,
                    body: d.body,
                    archived: d.archived,
                  })
                }
              >
                Edit and history
              </Button>
            )}
          </article>
        ))}
        {!draft && historyId && (
          <section
            className="flex flex-col gap-3"
            aria-label="Knowledge revision history"
          >
            <h2 className="text-headline-medium">Revision history</h2>
            {revisions.isPending && <p>Loading revisions…</p>}
            {revisions.error && <p role="alert">{errorMessage(revisions.error)}</p>}
            {revisions.data?.map((r) => (
              <article key={r.id}>
                <h3 className="text-body-medium">
                  {r.title} · revision {r.version}
                </h3>
                <MarkdownPreview text={r.body} />
              </article>
            ))}
          </section>
        )}
        {draft && (
          <section
            className="flex flex-col gap-4 rounded-md border border-border-button-default p-4"
            aria-label="Knowledge editor"
          >
            <Input
              label="Document title"
              value={draft.title}
              onChange={(title) => setDraft({ ...draft, title })}
            />
            <div className="flex flex-wrap gap-2">
              {(
                ["architecture", "conventions", "testing", "review"] as const
              ).map((category) => (
                <Button
                  key={category}
                  variant={
                    draft.category === category ? "primary" : "secondary"
                  }
                  aria-pressed={draft.category === category}
                  onClick={() => setDraft({ ...draft, category })}
                >
                  {category}
                </Button>
              ))}
            </div>
            <Textarea
              label="Markdown content"
              value={draft.body}
              onChange={(body) => setDraft({ ...draft, body })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  save.isPending || !draft.title.trim() || !draft.body.trim()
                }
                onClick={() => save.mutate({ repo, ...draft })}
              >
                Save revision
              </Button>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              {draft.id && (
                <Button
                  variant="secondary"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ repo, ...draft, archived: !draft.archived })
                  }
                >
                  {draft.archived ? "Restore document" : "Archive document"}
                </Button>
              )}
            </div>
            {save.error && (
              <p role="alert" className="text-text-error-primary">
                {errorMessage(save.error)}
              </p>
            )}
            {revisions.data?.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <p className="text-caption-1-regular">
                  Revision {r.version} · {r.createdAt.toLocaleString()}
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      title: r.title,
                      category: r.category as Category,
                      body: r.body,
                    })
                  }
                >
                  Use this revision
                </Button>
              </div>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p>Loading knowledge…</p>}>
      <Knowledge />
    </Suspense>
  );
}
