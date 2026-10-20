"use client";

import { RISK_LABEL, type RiskKind, formattingOnly, riskSummary, riskyLines } from "@/lib/review-signals";
import { errorMessage } from "@/lib/error-message";
import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { Button as ShadcnButton } from "@/components/ui/button";
import type { RankedFile } from "@docks/api";
import { useQuery } from "@tanstack/react-query";
import { IconChevronDown, IconChevronRight, IconMessagePlus } from "@tabler/icons-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FixWithAgent } from "@/components/review/agent-handoff";
import { BlameLine, useBlame } from "@/components/review/blame-popover";
import { Collapse, flash } from "@/components/motion";
import { MarkdownPreview } from "@/components/review/markdown-preview";
import { useDiffHighlight, useFileHighlight } from "@/components/review/use-highlight";
import { VirtualTable } from "@/components/review/virtual-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addedLines, changedSymbols, languageFor, pairChanges, parsePatch, toSplit, withContext, wordRange, type DiffLine } from "@/lib/diff";
import { cx as cn } from "@/utils/cx";
import { useTRPC } from "@/trpc/react";
import { type Side, type PendingComment, type Thread, ROW, VIRTUAL_AT, LARGE_DIFF, TIER_LABEL } from "./diff-types";
import { Code } from "./diff-code";
import { LabelBadge, Composer, ThreadView } from "./diff-thread";
export type { Side, PendingComment, Thread } from "./diff-types";

/** One file: diff (unified/split) or full file, line comments, threads, Viewed (§5.3, M6). */
export function FileDiff({
  file,
  onViewedChange,
  repo,
  number,
  threads,
  pending,
  canAct,
  mode,
  onAddPending,
  onThreadsChanged,
  highlightNew,
  branch,
}: {
  file: RankedFile;
  onViewedChange: (viewed: boolean) => void;
  repo: string;
  number: number;
  threads: Thread[];
  pending: PendingComment[];
  canAct: boolean;
  mode: "unified" | "split";
  onAddPending: (c: PendingComment) => void;
  onThreadsChanged: () => void;
  highlightNew?: boolean;
  branch: string;
}) {
  const trpc = useTRPC();
  // Noise and whitespace-only files start folded: they rarely need reading.
  const [open, setOpen] = useState(
    () => file.tier !== "noise" && !file.viewed && !(file.patch && formattingOnly(parsePatch(file.patch))),
  );
  const [everOpen, setEverOpen] = useState(open);
  useEffect(() => {
    if (open) setEverOpen(true);
  }, [open]);
  const [view, setView] = useState<"diff" | "full" | "preview">("diff");
  const full = view !== "diff";
  const [loadLarge, setLoadLarge] = useState(false);
  const jump = useRef<{ scrollTo: (i: number) => void } | null>(null);
  const section = useRef<HTMLElement>(null);
  // Mount a file's rows only once it's near the viewport: a 300-file PR opens instantly.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = section.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (e) => e.some((x) => x.isIntersecting) && setNear(true),
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  // Jumping here (rail, file finder, outline) expands a collapsed file.
  useEffect(() => {
    const onHash = () => {
      if (decodeURIComponent(location.hash) === `#file-${file.filename}`) {
        setOpen(true);
        setNear(true);
        if (document.readyState === "complete") flash(section.current);
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [file.filename]);
  const [composer, setComposer] = useState<{
    line: number;
    startLine?: number;
    side: Side;
  } | null>(null);
  const [above, setAbove] = useState<Record<number, number>>({});
  const language = languageFor(file.filename);
  const isMarkdown = language === "markdown";
  const lines = useMemo(
    () => (file.patch ? parsePatch(file.patch) : []),
    [file.patch],
  );
  const symbols = useMemo(() => changedSymbols(lines).slice(0, 12), [lines]);
  const risky = useMemo(() => riskyLines(file.filename, lines), [file.filename, lines]);
  const risks = useMemo(() => riskSummary(risky), [risky]);
  const formatting = useMemo(() => formattingOnly(lines), [lines]);
  const pairs = useMemo(() => pairChanges(lines), [lines]);
  const content = useQuery({
    ...trpc.review.fileContent.queryOptions({
      repo,
      number,
      path: file.filename,
    }),
    enabled: (full || Object.keys(above).length > 0) && open,
  });
  const blame = useBlame(
    repo,
    number,
    file.filename,
    open && near && file.status !== "added",
  );
  const fileLines = useMemo(
    () => content.data?.text.split("\n"),
    [content.data],
  );
  const shown = useMemo(
    () => withContext(lines, fileLines, above),
    [lines, fileLines, above],
  );
  const tooLarge = !full && !loadLarge && lines.length > LARGE_DIFF;
  const rendered = open && near && !tooLarge;
  const html = useDiffHighlight(shown, language, rendered && view === "diff");
  const fileHtml = useFileHighlight(
    content.data?.text,
    language,
    rendered && full && view !== "preview",
  );
  const splitRows = useMemo(
    () => (mode === "split" ? toSplit(shown) : []),
    [shown, mode],
  );
  // Each row's hunk number and the last new-file line before it, so rows can render on their own when windowed.
  const meta = useMemo(() => {
    let hunk = -1;
    let lastNew = 0;
    const src: { hunk: boolean; newNo?: number }[] =
      mode === "split"
        ? splitRows.map((r) =>
            r.kind === "hunk"
              ? { hunk: true }
              : { hunk: false, newNo: r.right?.newNo },
          )
        : shown.map((l) => ({ hunk: l.kind === "hunk", newNo: l.newNo }));
    return src.map((r) => {
      if (r.hunk) hunk++;
      const out = { hunk, lastNew };
      if (!r.hunk && r.newNo) lastNew = r.newNo;
      return out;
    });
  }, [shown, splitRows, mode]);
  const markFor = (l?: DiffLine) => {
    const other = l && pairs.get(l);
    return other ? wordRange(l.text, other.text) : null;
  };
  const selected = (side: Side, n?: number) =>
    composer !== null &&
    n !== undefined &&
    composer.side === side &&
    n >= (composer.startLine ?? composer.line) &&
    n <= composer.line;
  const tier = TIER_LABEL[file.tier];

  const at = (side: Side, line?: number) =>
    line === undefined
      ? []
      : threads.filter((t) => t.diffSide === side && t.line === line);
  const pendingAt = (side: Side, line?: number) =>
    line === undefined
      ? []
      : pending.filter((p) => p.side === side && p.line === line);

  function pick(e: React.MouseEvent, n: number, side: Side) {
    if (
      e.shiftKey &&
      composer &&
      composer.side === side &&
      n !== composer.line
    ) {
      const lo = Math.min(
        n,
        composer.startLine ?? composer.line,
        composer.line,
      );
      const hi = Math.max(n, composer.line);
      setComposer({ side, line: hi, startLine: lo });
    } else setComposer({ line: n, side });
  }

  function NumberCell({
    n,
    side,
    text,
    extra,
    risk,
  }: {
    n?: number;
    side: Side;
    text: string;
    extra?: boolean;
    /** Lines worth a careful read show their number in amber, explained on hover. */
    risk?: RiskKind;
  }) {
    const showBlame =
      side === "LEFT" && n !== undefined && !extra && file.status !== "added";
    const num = showBlame ? (
      <BlameLine
        repo={repo}
        number={number}
        path={file.filename}
        line={n!}
        ranges={blame.data?.ranges}
        isPending={blame.isPending}
      >
        {n}
      </BlameLine>
    ) : (
      n
    );
    return (
      <td
        className={cn(
          "text-muted-foreground w-10 px-2 text-right align-top select-none",
          risk && "font-semibold text-amber-600 dark:text-amber-400",
          selected(side, n) && "bg-sky-500/20",
        )}
        title={risk ? `Worth a careful look: ${RISK_LABEL[risk].toLowerCase()}` : undefined}
      >
        {n !== undefined && canAct && !extra ? (
          <ShadcnButton
            variant="row"
            size="none"
            type="button"
            className="group relative h-auto w-full justify-end p-0 text-right hover:text-foreground has-[>svg]:px-0"
            aria-label={`Comment on ${side === "LEFT" ? "old" : "new"} line ${n}`}
            onClick={(e) => pick(e, n, side)}
            data-text={text}
            data-review-line={side === "RIGHT" ? n : undefined}
          >
            <IconMessagePlus
              className="absolute top-0.5 -left-1 size-3.5 text-primary-text opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
            {num}
          </ShadcnButton>
        ) : (
          num
        )}
      </td>
    );
  }

  function Extras({
    side,
    line,
    text,
    colSpan,
  }: {
    side: Side;
    line?: number;
    text: string;
    colSpan: number;
  }) {
    const list = at(side, line);
    const mine = pendingAt(side, line);
    const composing =
      composer && composer.side === side && composer.line === line;
    if (!list.length && !mine.length && !composing) return null;
    return (
      <tr>
        <td colSpan={colSpan} className="p-0">
          {list.map((t) => (
            <ThreadView
              key={t.id}
              thread={t}
              repo={repo}
              number={number}
              branch={branch}
              canAct={canAct}
              onChanged={onThreadsChanged}
            />
          ))}
          {mine.map((p, i) => (
            <div
              key={i}
              className="m-2 rounded-md bg-muted/50 p-2 font-sans text-sm"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline">pending</Badge>
                  <LabelBadge body={p.body} />
                  {p.startLine && (
                    <span className="text-muted-foreground text-xs">
                      lines {p.startLine}–{p.line}
                    </span>
                  )}
                </span>
                <FixWithAgent
                  compact
                  context={{
                    repo,
                    number,
                    branch,
                    path: p.path,
                    line: p.line,
                    comments: [{ author: "you", body: p.body }],
                  }}
                />
              </div>
              <p className="whitespace-pre-wrap">{p.body}</p>
            </div>
          ))}
          {composing && (
            <Composer
              path={file.filename}
              line={line!}
              startLine={composer.startLine}
              side={side}
              lineText={
                composer.startLine
                  ? lines
                      .filter(
                        (l) =>
                          l.kind !== "hunk" &&
                          (side === "LEFT"
                            ? l.kind !== "add" &&
                              l.oldNo! >= composer.startLine! &&
                              l.oldNo! <= line!
                            : l.kind !== "del" &&
                              l.newNo! >= composer.startLine! &&
                              l.newNo! <= line!),
                      )
                      .map((l) => l.text)
                      .join("\n")
                  : text
              }
              repo={repo}
              number={number}
              onAddPending={(c) => {
                onAddPending(c);
                setComposer(null);
              }}
              onPosted={() => {
                setComposer(null);
                onThreadsChanged();
              }}
              onCancel={() => setComposer(null)}
            />
          )}
        </td>
      </tr>
    );
  }

  function HunkRow({
    text,
    hunk,
    lastNew,
    colSpan,
  }: {
    text: string;
    hunk: number;
    lastNew: number;
    colSpan: number;
  }) {
    const gap = Number(text.match(/\+(\d+)/)?.[1] ?? 1) - 1 - lastNew;
    return (
      <tr className={ROW.hunk} data-hunk={hunk}>
        <td colSpan={colSpan} className="px-3">
          <span className="flex items-center gap-3">
            {above[hunk] !== undefined && content.isError ? (
              <span className="text-destructive font-sans text-[11px]">
                Couldn&apos;t load more lines
              </span>
            ) : above[hunk] !== undefined && content.isPending ? (
              <span className="font-sans text-[11px]">Loading…</span>
            ) : (
              gap > 0 &&
              file.status !== "added" && (
                <ShadcnButton
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setAbove((a) => ({ ...a, [hunk]: (a[hunk] ?? 0) + 20 }))
                  }
                  className="hover:text-foreground hover:bg-background/60 -ml-1.5 rounded px-1.5 font-sans text-[11px] transition-colors"
                  title={`${gap} hidden line${gap === 1 ? "" : "s"} above`}
                >
                  ↑ {Math.min(gap, 20)} more
                </ShadcnButton>
              )
            )}
            <span className="truncate">{text}</span>
          </span>
        </td>
      </tr>
    );
  }

  const [resumeLine, setResumeLine] = useState<number | null>(null);
  useEffect(() => {
    const resume = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; line?: number }>)
        .detail;
      if (detail.path === file.filename && detail.line) {
        setOpen(true);
        setNear(true);
        setResumeLine(detail.line);
      }
    };
    window.addEventListener("review-resume", resume);
    return () => window.removeEventListener("review-resume", resume);
  }, [file.filename]);
  useEffect(() => {
    if (!resumeLine || !rendered) return;
    const at =
      mode === "split"
        ? splitRows.findIndex(
            (r) => r.kind !== "hunk" && r.right?.newNo === resumeLine,
          )
        : shown.findIndex((r) => r.newNo === resumeLine);
    if (at >= 0 && jump.current) jump.current.scrollTo(at);
    else
      section.current
        ?.querySelector<HTMLElement>(`[data-review-line="${resumeLine}"]`)
        ?.scrollIntoView({ block: "center" });
    setResumeLine(null);
  }, [resumeLine, rendered, mode, splitRows, shown]);

  function unifiedRow(i: number) {
    const line = shown[i]!;
    if (line.kind === "hunk")
      return HunkRow({
        text: line.text,
        hunk: meta[i]!.hunk,
        lastNew: meta[i]!.lastNew,
        colSpan: 3,
      });
    const side: Side = line.kind === "del" ? "LEFT" : "RIGHT";
    const n = side === "LEFT" ? line.oldNo : line.newNo;
    return (
      <>
        <tr
          className={cn(
            ROW[line.kind],
            line.extra &&
              "text-muted-foreground bg-muted/30 animate-in fade-in duration-300",
          )}
        >
          {NumberCell({
            n: line.kind === "add" ? undefined : line.oldNo,
            side: "LEFT",
            risk: line.kind === "del" ? risky.get(line) : undefined,
            text: line.text,
            extra: line.extra,
          })}
          {NumberCell({
            n: line.kind === "del" ? undefined : line.newNo,
            side: "RIGHT",
            risk: line.kind === "add" ? risky.get(line) : undefined,
            text: line.text,
            extra: line.extra,
          })}
          <td className="px-2 whitespace-pre">
            <span className="text-muted-foreground mr-2 select-none">
              {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
            </span>
            <Code
              text={line.text}
              html={html.get(line)}
              mark={markFor(line)}
              kind={line.kind === "del" ? "del" : "add"}
            />
          </td>
        </tr>
        {Extras({ side, line: n, text: line.text, colSpan: 3 })}
        {line.kind === "ctx" &&
          Extras({
            side: "LEFT",
            line: line.oldNo,
            text: line.text,
            colSpan: 3,
          })}
      </>
    );
  }

  function splitRow(i: number) {
    const row = splitRows[i]!;
    if (row.kind === "hunk")
      return HunkRow({
        text: row.text,
        hunk: meta[i]!.hunk,
        lastNew: meta[i]!.lastNew,
        colSpan: 4,
      });
    const { left, right } = row;
    return (
      <>
        <tr>
          {NumberCell({
            n: left?.oldNo,
            side: "LEFT",
            risk: left ? risky.get(left) : undefined,
            text: left?.text ?? "",
            extra: left?.extra,
          })}
          <td
            className={cn(
              "w-1/2 border-r px-2 whitespace-pre",
              left && ROW[left.kind === "ctx" ? "ctx" : "del"],
              left?.extra && "text-muted-foreground bg-muted/30",
            )}
          >
            {left && (
              <Code
                text={left.text}
                html={html.get(left)}
                mark={markFor(left)}
                kind="del"
              />
            )}
          </td>
          {NumberCell({
            n: right?.newNo,
            side: "RIGHT",
            risk: right ? risky.get(right) : undefined,
            text: right?.text ?? "",
            extra: right?.extra,
          })}
          <td
            className={cn(
              "w-1/2 px-2 whitespace-pre",
              right && ROW[right.kind === "ctx" ? "ctx" : "add"],
              right?.extra && "text-muted-foreground bg-muted/30",
            )}
          >
            {right && (
              <Code
                text={right.text}
                html={html.get(right)}
                mark={markFor(right)}
                kind="add"
              />
            )}
          </td>
        </tr>
        {Extras({
          side: "LEFT",
          line: left?.kind === "del" ? left.oldNo : undefined,
          text: left?.text ?? "",
          colSpan: 4,
        })}
        {Extras({
          side: "RIGHT",
          line: right?.newNo,
          text: right?.text ?? "",
          colSpan: 4,
        })}
      </>
    );
  }

  const diffRow = mode === "split" ? splitRow : unifiedRow;
  const diffCount = mode === "split" ? splitRows.length : shown.length;
  const diffCols = mode === "split" ? 4 : 3;
  const fileText = content.data?.text.split("\n");
  const added = useMemo(
    () => (file.patch ? addedLines(file.patch) : new Set<number>()),
    [file.patch],
  );

  function fullRow(i: number) {
    return (
      <tr className={added.has(i + 1) ? ROW.add : ""}>
        <td className="text-muted-foreground w-12 px-2 text-right select-none">
          {i + 1}
        </td>
        <td className="px-2 whitespace-pre">
          <Code text={fileText![i]!} html={fileHtml[i]} />
        </td>
      </tr>
    );
  }

  /** The body of the file card: diff rows, whole file, or markdown preview. Windowed once a file is long. */
  function body() {
    if (view === "preview") {
      if (content.isPending)
        return (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            Loading file…
          </p>
        );
      if (content.error)
        return (
          <p className="text-destructive px-3 py-4 text-sm">
            {errorMessage(content.error)}
          </p>
        );
      return <MarkdownPreview text={content.data!.text} />;
    }
    if (full) {
      if (content.isPending)
        return (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            Loading file…
          </p>
        );
      if (content.error)
        return (
          <p className="text-destructive px-3 py-4 text-sm">
            {errorMessage(content.error)}
          </p>
        );
      return fileText!.length > VIRTUAL_AT ? (
        <VirtualTable
          className="font-code w-full border-collapse text-[12.5px] leading-5"
          count={fileText!.length}
          colSpan={2}
          renderItem={fullRow}
        />
      ) : (
        <table className="font-code w-full border-collapse text-[12.5px] leading-5">
          <tbody>
            {fileText!.map((_, i) => (
              <Fragment key={i}>{fullRow(i)}</Fragment>
            ))}
          </tbody>
        </table>
      );
    }
    return diffCount > VIRTUAL_AT ? (
      <VirtualTable
        className="font-code w-full border-collapse text-[12.5px] leading-5"
        count={diffCount}
        colSpan={diffCols}
        renderItem={diffRow}
        handle={jump}
      />
    ) : (
      <table className="font-code w-full border-collapse text-[12.5px] leading-5">
        <tbody>
          {Array.from({ length: diffCount }, (_, i) => (
            <Fragment key={i}>{diffRow(i)}</Fragment>
          ))}
        </tbody>
      </table>
    );
  }

  const threadCount = threads.filter((t) => !t.isResolved).length;

  return (
    <section
      ref={section}
      id={`file-${file.filename}`}
      data-viewed={file.viewed || undefined}
      className={cn(
        "bg-background-primary-default scroll-mt-20 rounded-md border border-separator-border",
        !near && "[contain-intrinsic-size:auto_3rem] [content-visibility:auto]",
      )}
    >
      <header className="bg-background-primary-default border-separator-border sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-t-lg border-b px-3 py-2 text-body-2-regular max-sm:gap-1.5 max-sm:py-1.5">
        <ShadcnButton
          variant="row"
          size="none"
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left"
          aria-expanded={open}
        >
          {open ? (
            <IconChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <IconChevronRight className="size-4 shrink-0" aria-hidden />
          )}
          <span className="truncate font-mono text-xs">{file.filename}</span>
        </ShadcnButton>
        {tier && <Badge variant="outline">{tier}</Badge>}
        {formatting && <Badge variant="outline">formatting only</Badge>}
        {risks.slice(0, 1).map((k) => (
          <Badge
            key={k}
            variant="outline"
            title={`Line numbers in amber touch ${RISK_LABEL[k].toLowerCase()}. Read those closely.`}
            className="border-amber-500/40 text-amber-700 dark:text-amber-300"
          >
            {RISK_LABEL[k]} · {risky.size} {risky.size === 1 ? "line" : "lines"}
          </Badge>
        ))}
        {file.changedSinceViewed && (
          <Badge variant="secondary">changed since you viewed</Badge>
        )}
        {highlightNew && (
          <Badge variant="secondary">new since your review</Badge>
        )}
        {threadCount > 0 && (
          <Badge variant="outline">
            {threadCount} open thread{threadCount > 1 ? "s" : ""}
          </Badge>
        )}
        <span className="text-xs whitespace-nowrap">
          <span className="text-emerald-600">+{file.additions}</span>{" "}
          <span className="text-destructive">−{file.deletions}</span>
        </span>
        {open && file.status !== "removed" && (
          <div
            className="segmented text-xs"
            role="group"
            aria-label="File view"
          >
            {(
              [
                "diff",
                "full",
                ...(isMarkdown ? (["preview"] as const) : []),
              ] as const
            ).map((v) => (
              <ShadcnButton
                variant="ghost"
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "diff" ? "Diff" : v === "full" ? "File" : "Preview"}
              </ShadcnButton>
            ))}
          </div>
        )}
        <FixWithAgent
          compact
          label="Agent"
          context={{
            repo,
            number,
            branch,
            path: file.filename,
            line: null,
            comments: threads
              .filter((t) => !t.isResolved)
              .flatMap((t) => t.comments.map((c) => ({ ...c, line: t.line }))),
          }}
        />
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <ShadcnCheckbox
            className="size-4"
            checked={file.viewed}
            onChange={(e) => {
              onViewedChange(e.target.checked);
              if (e.target.checked) setOpen(false);
            }}
          />
          Viewed
        </label>
      </header>
      {everOpen && (
        <Collapse open={open}>
          {view === "diff" && symbols.length > 2 && (
            <nav
              aria-label="Changed symbols"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-[11px]"
            >
              <span className="text-muted-foreground">Jump to</span>
              {symbols.map((s) => (
                <ShadcnButton
                  variant="ghost"
                  key={s.name}
                  type="button"
                  onClick={() => {
                    const el = section.current?.querySelector(
                      `[data-hunk="${s.hunk}"]`,
                    );
                    if (el)
                      el.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    else
                      jump.current?.scrollTo(
                        meta.findIndex(
                          (m, i) =>
                            m.hunk === s.hunk &&
                            (mode === "split"
                              ? splitRows[i]?.kind === "hunk"
                              : shown[i]?.kind === "hunk"),
                        ),
                      );
                  }}
                  className="text-foreground hover:text-primary h-auto p-0 font-code text-[11px] underline-offset-4 hover:underline"
                >
                  {s.name}
                </ShadcnButton>
              ))}
            </nav>
          )}
          {!near && (
            <div
              aria-hidden
              className="bg-muted/30 m-3 animate-pulse rounded-md"
              style={{
                height: Math.max(60, Math.min(lines.length, 40) * 20 - 24),
              }}
            />
          )}
          {near && tooLarge && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 px-3 py-8 text-center text-sm">
              <p>
                This is a large diff ({lines.length.toLocaleString()} lines), so
                it isn&apos;t shown until you ask.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLoadLarge(true)}
              >
                Show diff
              </Button>
            </div>
          )}
          {near &&
            !tooLarge &&
            (full || file.patch ? (
              <div
                className={cn(
                  "rounded-b-xl",
                  view !== "preview" && "overflow-x-auto",
                )}
              >
                {body()}
              </div>
            ) : (
              <p className="text-muted-foreground px-3 py-4 text-sm">
                {file.status === "renamed"
                  ? "File renamed without changes."
                  : "Diff not shown (binary file or too large for GitHub to include)."}
              </p>
            ))}
        </Collapse>
      )}
    </section>
  );
}
