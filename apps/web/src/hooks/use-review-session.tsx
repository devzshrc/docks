"use client";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";

import type { ReviewSessionData } from "@docks/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { parseRecovery } from "@/lib/review-session";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/react";

const empty = (): ReviewSessionData => ({
  textDrafts: {},
  pending: [],
  checklist: { revision: "", checked: [] },
  lastLocation: null,
});
type Recovery = { version: number; data: ReviewSessionData };
type SessionContext = {
  data: ReviewSessionData;
  headSha: string;
  fileShas: Record<string, string>;
  paid: boolean;
  update: (fn: (data: ReviewSessionData) => ReviewSessionData) => void;
  flush: () => Promise<void>;
};
const Context = createContext<SessionContext | null>(null);

export function ReviewSessionProvider({
  repo,
  number,
  children,
}: {
  repo: string;
  number: number;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const { data: auth } = useSession();
  const pull = useQuery(trpc.review.get.queryOptions({ repo, number }));
  const query = useQuery({
    ...trpc.review.session.queryOptions({
      repo,
      number,
      clientUserId: auth?.user.id ?? "",
    }),
    refetchOnWindowFocus: false,
    staleTime: 0,
    enabled: Boolean(auth?.user.id),
  });
  const guide = useQuery(trpc.review.guide.queryOptions({ repo, number }));
  const save = useMutation(trpc.review.saveSession.mutationOptions());
  const [data, setData] = useState<ReviewSessionData>(empty);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Loading review recovery…");
  const [conflict, setConflict] = useState<Recovery | null>(null);
  const [legacy, setLegacy] = useState(false);
  const current = useRef(data);
  const version = useRef(0);
  const dirty = useRef(false);
  const edits = useRef(0);
  const saving = useRef(false);
  const conflictRef = useRef(false);
  const key = auth?.user.id
    ? `review-session:${auth.user.id}:${repo}#${number}`
    : null;
  const prefix = `draft:`;
  const suffix = `${repo}#${number}`;
  const persist = (value = current.current) => {
    if (!key || !loaded) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: version.current,
          data: value,
          dirty: dirty.current,
        }),
      );
    } catch {
      setStatus(
        "Local recovery is unavailable. Keep this page open until the server save succeeds.",
      );
    }
  };
  useEffect(() => {
    if (loaded || !key || (!query.isFetchedAfterMount && !query.error)) return;
    const remote = query.data ?? { version: 0, data: empty() };
    let initial = remote.data;
    let recoveredVersion = remote.version;
    try {
      const local = parseRecovery(localStorage.getItem(key));
      if (local && (local.dirty || query.error)) {
        initial = local.data;
        recoveredVersion = local.version;
        dirty.current = local.dirty;
        if (!query.error && local.version !== remote.version) {
          setConflict(remote);
          conflictRef.current = true;
        }
      }
      setLegacy(
        !localStorage.getItem(`${key}:legacy-imported`) &&
          Object.keys(localStorage).some(
            (k) =>
              (k.startsWith(prefix) &&
                (k.endsWith(suffix) || k.includes(`${suffix}:`))) ||
              k.startsWith(`checklist:${suffix}@`),
          ),
      );
    } catch {
      /* A malformed local copy must not replace server state. */
    }
    version.current = recoveredVersion;
    current.current = initial;
    setData(initial);
    setLoaded(true);
    setStatus(
      query.error
        ? "Server recovery unavailable. Drafts remain on this device."
        : dirty.current
          ? "Unsaved changes"
          : "Saved",
    );
  }, [query.data, query.error, query.isFetchedAfterMount, key, loaded, suffix]);

  useEffect(() => {
    if (
      loaded &&
      conflictRef.current &&
      !conflict &&
      query.data &&
      !query.isFetching
    )
      setConflict(query.data);
  }, [loaded, query.data, query.isFetching, conflict]);

  function update(fn: (value: ReviewSessionData) => ReviewSessionData) {
    const next = fn(current.current);
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    current.current = next;
    dirty.current = true;
    edits.current++;
    setData(next);
    setStatus("Unsaved changes");
    persist(next);
  }

  async function flush() {
    if (!loaded || !dirty.current || saving.current || conflictRef.current)
      return;
    saving.current = true;
    const generation = edits.current;
    const snapshot = current.current;
    setStatus("Saving…");
    try {
      const result = await save.mutateAsync({
        repo,
        number,
        version: version.current,
        data: snapshot,
      });
      version.current = result.version;
      if (edits.current === generation) dirty.current = false;
      persist();
      setStatus(dirty.current ? "Unsaved changes" : "Saved");
    } catch (error) {
      if ((error as { data?: { code?: string } }).data?.code === "CONFLICT") {
        conflictRef.current = true;
        const fresh = await query.refetch();
        if (fresh.data) {
          setConflict(fresh.data);
          try {
            if (key)
              localStorage.setItem(
                `${key}:conflict`,
                JSON.stringify({ local: snapshot, remote: fresh.data }),
              );
          } catch {}
        }
        setStatus("Another device changed this review. Choose a copy below.");
      } else setStatus("Save failed. Your drafts remain on this device.");
    } finally {
      saving.current = false;
    }
  }
  const actions = useRef({ flush, persist });
  actions.current = { flush, persist };
  useEffect(() => {
    if (
      !loaded ||
      conflictRef.current ||
      status.startsWith("Save failed") ||
      status.startsWith("Server recovery unavailable")
    )
      return;
    const timer = setTimeout(() => void actions.current.flush(), 800);
    return () => clearTimeout(timer);
  }, [data, loaded, status]);
  useEffect(() => {
    const blur = () => void actions.current.flush();
    const leave = (event: BeforeUnloadEvent) => {
      actions.current.persist();
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", leave);
      actions.current.persist();
      void actions.current.flush();
    };
  }, []);

  function choose(local: boolean) {
    if (!conflict) return;
    version.current = conflict.version;
    conflictRef.current = false;
    setConflict(null);
    if (!local) {
      current.current = conflict.data;
      setData(conflict.data);
      dirty.current = false;
      persist();
      setStatus("Saved");
    } else {
      dirty.current = true;
      edits.current++;
      setStatus("Unsaved changes");
      persist();
      void flush();
    }
  }
  function importLegacy() {
    const next = structuredClone(current.current);
    const checklistItems = [
      ...(pull.data?.checklistTemplate ?? []).map((question) => ({
        question,
        files: [] as string[],
      })),
      ...(guide.data?.status === "ready" ? guide.data.guide.checklist : []),
    ];
    const checklistKey = `checklist:${suffix}@${pull.data?.pr.headSha}`;
    try {
      const previous: unknown = JSON.parse(
        localStorage.getItem(checklistKey) ?? "[]",
      );
      const ids = checklistItems.map((item) =>
        JSON.stringify([item.question, item.files]),
      );
      if (Array.isArray(previous) && !next.checklist.checked.length)
        next.checklist = {
          revision: `${checklistKey}:${JSON.stringify(ids)}`,
          checked: previous
            .filter((i) => Number.isInteger(i) && i >= 0 && i < ids.length)
            .map((i) => ids[i]!),
        };
    } catch {}
    for (const k of Object.keys(localStorage)) {
      if (
        k.startsWith(prefix) &&
        (k.endsWith(suffix) || k.includes(`${suffix}:`))
      ) {
        try {
          const value: unknown = JSON.parse(localStorage.getItem(k)!);
          if (typeof value === "string" && !next.textDrafts[k])
            next.textDrafts[k] = value;
          if (k === `draft:comments:${suffix}` && Array.isArray(value)) {
            for (const c of value)
              if (
                typeof c?.path === "string" &&
                typeof c?.body === "string" &&
                Number.isInteger(c?.line) &&
                ["LEFT", "RIGHT"].includes(c?.side)
              )
                next.pending.push({
                  ...c,
                  id: crypto.randomUUID(),
                  headSha: "0".repeat(40),
                });
          }
        } catch {}
      }
    }
    update(() => next);
    try {
      if (key) localStorage.setItem(`${key}:legacy-imported`, "true");
    } catch {}
    setLegacy(false);
  }
  return (
    <Context.Provider
      value={{
        data,
        headSha: pull.data?.pr.headSha ?? "",
        fileShas: Object.fromEntries(
          (pull.data?.files ?? []).map((f) => [f.filename, f.sha]),
        ),
        paid: pull.data?.advancedReview ?? false,
        update,
        flush,
      }}
    >
      <div
        // Routine autosave stays quiet (screen readers still hear it); the panel only shows when something needs a decision.
        className={
          !query.error && !conflict && !legacy && Object.keys(data.textDrafts).length === 0 && ["Loading review recovery…", "Saved", "Saving…", "Unsaved changes"].includes(status)
            ? "sr-only"
            : "mb-4 space-y-2 rounded-lg border p-3 text-xs"
        }
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span>{status}</span>
          {loaded && (
            <ShadcnButton
              variant="ghost"
              type="button"
              className="underline"
              onClick={() => void flush()}
            >
              Save now
            </ShadcnButton>
          )}
          {(query.error || (conflictRef.current && !conflict)) && (
            <ShadcnButton
              variant="ghost"
              type="button"
              className="underline"
              onClick={() => void query.refetch()}
            >
              Retry connection
            </ShadcnButton>
          )}
        </div>
        {Object.keys(data.textDrafts).length > 0 && (
          <details>
            <summary>All saved text drafts</summary>
            {Object.entries(data.textDrafts).map(([k, v]) => (
              <label key={k} className="block">
                {k}
                <ShadcnTextarea
                  readOnly
                  className="bg-background h-20 w-full border"
                  value={v}
                />
              </label>
            ))}
          </details>
        )}
        {legacy && (
          <div>
            Local drafts from the previous version exist. Import only if these
            drafts belong to you.{" "}
            <ShadcnButton
              variant="ghost"
              type="button"
              className="underline"
              onClick={importLegacy}
            >
              Import local drafts
            </ShadcnButton>
          </div>
        )}
        {conflict && (
          <div className="space-y-2">
            <p>Both copies remain available. Select the copy to continue.</p>
            <details>
              <summary>Compare copies</summary>
              <label>
                Current device
                <ShadcnTextarea
                  readOnly
                  className="bg-background h-32 w-full border"
                  value={JSON.stringify(data, null, 2)}
                />
              </label>
              <label>
                Other device
                <ShadcnTextarea
                  readOnly
                  className="bg-background h-32 w-full border"
                  value={JSON.stringify(conflict.data, null, 2)}
                />
              </label>
            </details>
            <div className="flex gap-3">
              <ShadcnButton
                variant="ghost"
                type="button"
                className="underline"
                onClick={() => choose(true)}
              >
                Keep current device
              </ShadcnButton>
              <ShadcnButton
                variant="ghost"
                type="button"
                className="underline"
                onClick={() => choose(false)}
              >
                Use other device
              </ShadcnButton>
              <ShadcnButton
                variant="ghost"
                type="button"
                className="underline"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob(
                      [
                        JSON.stringify(
                          { local: data, remote: conflict.data },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "review-recovery.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download both copies
              </ShadcnButton>
            </div>
          </div>
        )}
      </div>
      {loaded ? children : <p className="text-sm">Loading review…</p>}
    </Context.Provider>
  );
}

export function useReviewSession() {
  const session = useContext(Context);
  if (!session) throw new Error("Review session provider is missing");
  return session;
}

export function useReviewDraft(key: string) {
  const { data, update } = useReviewSession();
  const value = data.textDrafts[key] ?? "";
  const set = (next: SetStateAction<string>) =>
    update((state) => {
      const text =
        typeof next === "function" ? next(state.textDrafts[key] ?? "") : next;
      const drafts = { ...state.textDrafts };
      if (text) drafts[key] = text;
      else delete drafts[key];
      return { ...state, textDrafts: drafts };
    });
  return [value, set] as const;
}
