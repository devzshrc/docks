"use client";
import type { RankedFile } from "@docks/api";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { FileIcon } from "@/components/file-icon";
import { fuzzyScore } from "@/lib/diff";
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
export function FileFinder({ files }: { files: RankedFile[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "t" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !typing(e.target) &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        setQ("");
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const results = files
    .map((f) => ({ f, score: fuzzyScore(q, f.filename) }))
    .filter((r): r is { f: RankedFile; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setQ("");
          setOpen(true);
        }}
      >
        <Search />
        Find file<kbd className="rounded border px-1 text-xs">t</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Find file"
        description="Jump to a file in this pull request."
      >
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder={`Find one of ${files.length} files…`}
        />
        <CommandList>
          <CommandEmpty>No matching files.</CommandEmpty>
          {results.map(({ f }) => (
            <CommandItem
              key={f.filename}
              value={f.filename}
              onSelect={() => {
                setOpen(false);
                location.hash = `file-${f.filename}`;
              }}
            >
              <FileIcon path={f.filename} />
              {f.filename}
            </CommandItem>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
