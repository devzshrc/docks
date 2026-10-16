"use client";
import { errorMessage } from "@/lib/error-message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useNewIssue } from "@/components/new-issue/provider";
import { useTRPC } from "@/trpc/react";

export type AskDetail = { path: string; line: number; question: string };

export function AskPanel({ repo, number }: { repo: string; number: number }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const issue = useNewIssue();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [path, setPath] = useState("");
  const [line, setLine] = useState("");
  const [knowledgeIds, setKnowledgeIds] = useState<string[]>([]);
  const history = useQuery({
    ...trpc.review.questions.queryOptions({ repo, number }),
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });
  const knowledge = useQuery({
    ...trpc.knowledge.list.queryOptions({ repo }),
    enabled: open,
  });
  const ask = useMutation(
    trpc.review.ask.mutationOptions({
      onSuccess: async () => {
        setQuestion("");
        await client.invalidateQueries(
          trpc.review.questions.queryFilter({ repo, number }),
        );
      },
    }),
  );
  // "Ask" from a diff line (file-diff dispatches review-ask) opens the panel and asks straight away.
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<AskDetail>).detail;
      setOpen(true);
      setQuestion("");
      setPath(d.path);
      setLine(String(d.line));
      askRef.current.mutate({ repo, number, question: d.question, path: d.path, line: d.line, knowledgeIds: [] });
      requestAnimationFrame(() =>
        document.getElementById("ask-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    };
    window.addEventListener("review-ask", onAsk);
    return () => window.removeEventListener("review-ask", onAsk);
  }, [repo, number]);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ask about this PR
      </Button>
    );
  return (
    <section
      id="ask-panel"
      className="flex flex-col gap-3 rounded-md border border-border-button-default p-4"
      aria-label="Ask about this PR"
    >
      <h3 className="text-headline-medium text-text-primary">
        Ask about this change
      </h3>
      {history.isPending && <p role="status">Loading conversation…</p>}
      {history.error && (
        <p role="alert" className="text-text-error-primary">
          {errorMessage(history.error)}
        </p>
      )}
      {history.data?.questions.map((q) => (
        <article
          key={q.id}
          className="flex flex-col gap-2 border-b border-separator-border pb-3"
        >
          <p className="text-body-medium text-text-primary">{q.question}</p>
          {q.headSha !== history.data.headSha && (
            <p className="text-caption-1-regular text-text-secondary">
              Answer from an earlier commit. Ask again to refresh.
            </p>
          )}
          <p className="whitespace-pre-wrap text-body-regular text-text-secondary">
            {q.answer}
          </p>
          <div className="flex flex-wrap gap-2">
            {q.citations.map((c) => (
              <a
                key={`${c.path}:${c.line}`}
                className="text-caption-1-regular underline"
                href={`https://github.com/${repo}/blob/${q.headSha}/${c.path.split("/").map(encodeURIComponent).join("/")}#L${c.line}`}
                target="_blank"
                rel="noreferrer"
              >
                {c.path}:{c.line}
              </a>
            ))}
          </div>
          {q.knowledge.map((k) => (
            <a
              key={k.id}
              className="text-caption-1-regular underline"
              href={`/settings/repositories/knowledge?repo=${encodeURIComponent(repo)}&document=${k.id}`}
            >
              {k.title} · revision {k.version}
            </a>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setQuestion(q.question)}>
              Ask again
            </Button>
            {issue.canCreate && q.status === "completed" && (
              <Button
                variant="secondary"
                onClick={() =>
                  issue.open({
                    repo,
                    source: "comment",
                    seed: {
                      title: q.question.slice(0, 100),
                      body: `${q.answer}\n\nSource: https://github.com/${repo}/pull/${number}\nCommit: ${q.headSha}\n\nVerify the AI answer before creating this issue.`,
                      followUp: {
                        repo,
                        number,
                        headSha: q.headSha,
                        path: q.path ?? undefined,
                      },
                    },
                  })
                }
              >
                Create follow-up issue
              </Button>
            )}
          </div>
        </article>
      ))}
      <Input
        label="File path (optional)"
        value={path}
        onChange={setPath}
        placeholder="src/auth.ts"
      />
      <Input
        label="New-side line (optional)"
        value={line}
        onChange={setLine}
        inputMode="numeric"
      />
      <div
        className="flex flex-wrap gap-2"
        aria-label="Repository knowledge context"
      >
        {knowledge.data?.documents.map((d) => (
          <Button
            key={d.id}
            variant={knowledgeIds.includes(d.id) ? "primary" : "secondary"}
            aria-pressed={knowledgeIds.includes(d.id)}
            disabled={!knowledgeIds.includes(d.id) && knowledgeIds.length >= 3}
            onClick={() =>
              setKnowledgeIds((ids) =>
                ids.includes(d.id)
                  ? ids.filter((id) => id !== d.id)
                  : [...ids, d.id],
              )
            }
          >
            {d.title}
          </Button>
        ))}
      </div>
      {knowledge.error && (
        <p role="alert" className="text-text-error-primary">
          {errorMessage(knowledge.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {[
          "Explain this change",
          "What could break?",
          "Which tests are missing?",
        ].map((prompt) => (
          <Button
            key={prompt}
            variant="secondary"
            onClick={() => setQuestion(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim())
            ask.mutate({
              repo,
              number,
              question,
              path: path.trim() || undefined,
              line: line ? Number(line) : undefined,
              knowledgeIds,
            });
        }}
      >
        <Input
          label="Question about this change"
          value={question}
          onChange={setQuestion}
          maxLength={2000}
        />
        <Button type="submit" disabled={ask.isPending || !question.trim()}>
          {ask.isPending ? "Thinking…" : "Ask"}
        </Button>
      </form>
      {ask.error && (
        <p role="alert" className="text-text-error-primary">
          {errorMessage(ask.error)}
        </p>
      )}
      <p className="text-caption-1-regular text-text-tertiary">
        Private conversation. Answers use the supplied diff and selected
        knowledge; omitted or truncated code can limit answers. Check cited code
        before acting.
      </p>
    </section>
  );
}
