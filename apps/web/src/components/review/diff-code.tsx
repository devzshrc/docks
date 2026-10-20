"use client";

import { memo, useEffect, useRef } from "react";

/** Word-level change marks use the CSS Custom Highlight API: no extra DOM, works on top of hljs markup. */
let words: { add: Highlight; del: Highlight } | null | undefined;
export function wordHighlights() {
  if (words === undefined) {
    words =
      typeof CSS !== "undefined" && "highlights" in CSS
        ? { add: new Highlight(), del: new Highlight() }
        : null;
    if (words) {
      CSS.highlights.set("word-add", words.add);
      CSS.highlights.set("word-del", words.del);
    }
  }
  return words;
}

export function rangeIn(root: Node, [start, end]: [number, number]) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let began = false;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = n.textContent!.length;
    if (!began && start <= pos + len) {
      range.setStart(n, start - pos);
      began = true;
    }
    if (began && end <= pos + len) {
      range.setEnd(n, end - pos);
      return range;
    }
    pos += len;
  }
  return null;
}

/** One line of code. The highlighted markup comes from the worker; until it arrives the line shows as plain text. */
export const Code = memo(
  function Code({
    text,
    html,
    mark,
    kind,
  }: {
    text: string;
    html?: string;
    mark?: [number, number] | null;
    kind?: "add" | "del";
  }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
      const set = wordHighlights()?.[kind ?? "add"];
      const range =
        mark && kind && set && ref.current ? rangeIn(ref.current, mark) : null;
      if (!range) return;
      set!.add(range);
      return () => void set!.delete(range);
    }, [html, text, mark?.[0], mark?.[1], kind]);
    return html ? (
      <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    ) : (
      <span ref={ref}>{text}</span>
    );
  },
  (a, b) =>
    a.text === b.text &&
    a.html === b.html &&
    a.kind === b.kind &&
    a.mark?.[0] === b.mark?.[0] &&
    a.mark?.[1] === b.mark?.[1],
);
