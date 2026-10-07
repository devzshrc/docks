/** Pure logic behind "New issue": no model, no network. See the plan: deterministic issue creation. */

export type IssueType = "bug" | "feature" | "task";

// ---- Templates -------------------------------------------------------------------

export interface Section {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export const TEMPLATES: Record<IssueType, { label: string; sections: Section[]; label_hint: string | null; branch: string }> = {
  bug: {
    label: "Bug",
    label_hint: "bug",
    branch: "fix",
    sections: [
      { key: "what", label: "What happened", placeholder: "What went wrong, and what did you expect instead?", required: true },
      { key: "steps", label: "Steps to reproduce", placeholder: "1. Go to…\n2. Click…\n3. See the error", required: true },
      { key: "expected", label: "Expected behavior", placeholder: "What should have happened?", required: false },
      { key: "env", label: "Environment", placeholder: "Browser, OS, version, plan…", required: false },
    ],
  },
  feature: {
    label: "Feature",
    label_hint: "enhancement",
    branch: "feat",
    sections: [
      { key: "problem", label: "Problem", placeholder: "Who needs this, and what is hard today?", required: true },
      { key: "proposal", label: "Proposal", placeholder: "What should we build?", required: false },
      { key: "acceptance", label: "Acceptance criteria", placeholder: "- [ ] …", required: false },
    ],
  },
  task: {
    label: "Task",
    label_hint: null,
    branch: "chore",
    sections: [
      { key: "description", label: "Description", placeholder: "What needs to be done?", required: true },
      { key: "done", label: "Done when", placeholder: "- [ ] …", required: false },
    ],
  },
};

export interface CodeRef {
  path: string;
  /** 0 = the file as a whole (picked by hand, not from a trace). */
  line: number;
  url: string;
}

/** Sections to Markdown. Empty optional sections are left out; references are appended as links. */
export function compileBody(type: IssueType, values: Record<string, string>, refs: CodeRef[] = []): string {
  const parts: string[] = [];
  for (const s of TEMPLATES[type].sections) {
    const v = (values[s.key] ?? "").trim();
    if (v) parts.push(`## ${s.label}\n\n${v}`);
  }
  if (refs.length) parts.push(`## Code references\n\n${refs.map((r) => `- [\`${r.path}${r.line ? `:${r.line}` : ""}\`](${r.url})`).join("\n")}`);
  return parts.join("\n\n");
}

/** Names of required sections that are still empty (for the Create button's hint). */
export function missingRequired(type: IssueType, values: Record<string, string>): string[] {
  return TEMPLATES[type].sections.filter((s) => s.required && !(values[s.key] ?? "").trim()).map((s) => s.label);
}

export interface MdTemplate {
  name: string;
  about: string;
  title: string;
  labels: string[];
  assignees: string[];
  body: string;
}

/** `.github/ISSUE_TEMPLATE/*.md`: optional YAML-ish front matter (name, about, title, labels, assignees) + body. */
export function parseMdTemplate(file: string, text: string): MdTemplate {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta: Record<string, string> = {};
  if (fm) {
    for (const line of fm[1]!.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (m) meta[m[1]!.toLowerCase()] = m[2]!.trim().replace(/^['"]|['"]$/g, "");
    }
  }
  const list = (v?: string) =>
    (v ?? "")
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  return {
    name: meta.name || file.replace(/\.md$/i, "").replace(/[-_]/g, " "),
    about: meta.about ?? "",
    title: meta.title ?? "",
    labels: list(meta.labels),
    assignees: list(meta.assignees),
    body: text.slice(fm?.[0].length ?? 0).trim(),
  };
}

// ---- Titles, branches ---------------------------------------------------------------

export const MAX_TITLE = 256;
export const MAX_BODY = 65_536;

export const cleanTitle = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/-$/, "");

/** `fix/123-login-fails-behind-a-proxy`. Matches what `issueFromBranch` (links.ts) reads back. */
export function branchName(type: IssueType, number: number, title: string): string {
  const s = slug(title);
  return `${TEMPLATES[type].branch}/${number}${s ? `-${s}` : ""}`;
}

// ---- Duplicate search ------------------------------------------------------------------

const STOP = new Set(
  "a an and are as at be but by can cannot could did do does for from has have how i if in into is it its just not of on or our should so that the their then there these this to too was we were what when where which while who why will with would you your doesnt dont cant wont isnt arent wasnt not working issue bug problem error fails failing failed fix please add make".split(" "),
);

/** Up to six distinctive words from a title, for GitHub's `in:title` search. */
export function keywords(title: string): string[] {
  const seen = new Set<string>();
  for (const w of title.toLowerCase().split(/[^\p{L}\p{N}_-]+/u)) {
    if (w.length >= 3 && !STOP.has(w)) seen.add(w);
  }
  return [...seen].slice(0, 6);
}

// ---- Stack traces ----------------------------------------------------------------------

export interface RawRef {
  path: string;
  line: number;
}

const IGNORED = /(^|\/)(node_modules|vendor|\.git|dist|build|\.next|site-packages|dist-packages|webpack-internal:|internal)(\/|$)/;

function normalize(p: string): string {
  return p
    .replace(/^file:\/\//, "")
    .replace(/^webpack-internal:\/\/\/(\.\/)?/, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/[?#].*$/, "");
}

// path.ext:line[:col], covers JS/TS, Go, Rust ("--> src/x.rs:4:9"), C/C++ and most others.
const GENERIC = /(?<![\w/.\\-])((?:[A-Za-z]:)?\/?(?:[\w@.~+-]+[/\\])*[\w@.~+-]+\.[A-Za-z]{1,6}):(\d{1,6})(?::\d+)?/g;
const PYTHON = /File "([^"]+)", line (\d+)/g;
const JAVA = /\(([\w$]+\.(?:java|kt|scala|groovy)):(\d+)\)/g;

/** File:line pairs mentioned in pasted text. Unverified: resolve them against the repo tree. */
export function extractTraceRefs(text: string, max = 30): RawRef[] {
  const found: RawRef[] = [];
  const seen = new Set<string>();
  // Bundler/URL prefixes would otherwise hide the path from the pattern below.
  const clean = text.replace(/webpack-internal:\/\/\/(\.\/)?/g, "").replace(/file:\/\//g, "");
  for (const re of [PYTHON, JAVA, GENERIC]) {
    for (const m of clean.matchAll(re)) {
      const path = normalize(m[1]!);
      const line = Number(m[2]);
      const key = `${path}:${line}`;
      if (!path || IGNORED.test(path) || line < 1 || seen.has(key)) continue;
      seen.add(key);
      found.push({ path, line });
      if (found.length >= max) return found;
    }
  }
  return found;
}

export interface TreeIndex {
  all: Set<string>;
  byBase: Map<string, string[]>;
}

export function indexTree(paths: string[]): TreeIndex {
  const byBase = new Map<string, string[]>();
  for (const p of paths) {
    const base = p.slice(p.lastIndexOf("/") + 1);
    (byBase.get(base) ?? byBase.set(base, []).get(base)!).push(p);
  }
  return { all: new Set(paths), byBase };
}

/**
 * Maps a path from a trace onto a real repo path: exact match, else the longest trailing
 * part of the path that identifies exactly one file. Ambiguous or unknown paths give null.
 */
export function resolvePath(path: string, tree: TreeIndex): string | null {
  const p = normalize(path).replace(/^\/+/, "");
  if (tree.all.has(p)) return p;
  const segs = p.split("/");
  const candidates = tree.byBase.get(segs[segs.length - 1]!) ?? [];
  if (!candidates.length) return null;
  for (let k = segs.length; k >= 1; k--) {
    const suffix = segs.slice(segs.length - k).join("/");
    const hits = candidates.filter((c) => c === suffix || c.endsWith(`/${suffix}`));
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) return null; // ambiguous at this depth, and a shorter suffix can't be less ambiguous
  }
  return null;
}

/** Stable permalink (pinned to a commit) with the path URL-encoded segment by segment. */
export function permalink(repo: string, sha: string, path: string, line: number): string {
  return `https://github.com/${repo}/blob/${sha}/${path.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line}` : ""}`;
}

// ---- What GitHub actually applied --------------------------------------------------------

/** GitHub silently drops labels/assignees the creator can't set; report which ones didn't stick. */
export function unapplied(
  asked: { labels: string[]; assignees: string[] },
  got: { labels: string[]; assignees: string[] },
) {
  const lower = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));
  const gl = lower(got.labels);
  const ga = lower(got.assignees);
  return {
    labels: asked.labels.filter((l) => !gl.has(l.toLowerCase())),
    assignees: asked.assignees.filter((a) => !ga.has(a.toLowerCase())),
  };
}

// ---- Fuzzy file search (also used by the review page's file finder) ----------------------

/** Subsequence fuzzy match; higher is better, null when not a match. Favours file-name hits and runs. */
export function fuzzyScore(query: string, path: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "")
  if (!q) return 0
  const p = path.toLowerCase()
  const nameStart = p.lastIndexOf("/") + 1
  let score = 0
  let pi = 0
  let prev = -2
  for (const ch of q) {
    const at = p.indexOf(ch, pi)
    if (at === -1) return null
    score += at === prev + 1 ? 3 : 1
    if (at >= nameStart) score += 2
    if (at === nameStart || p[at - 1] === "/" || p[at - 1] === "." || p[at - 1] === "-" || p[at - 1] === "_") score += 2
    prev = at
    pi = at + 1
  }
  return score - p.length * 0.01
}
