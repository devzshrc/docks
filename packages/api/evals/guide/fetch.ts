/**
 * Freeze the eval PRs into fixtures/ so runs don't depend on GitHub.
 *
 *   pnpm --filter @docks/api eval:guide:fetch          # missing fixtures only
 *   pnpm --filter @docks/api eval:guide:fetch --force  # refetch all
 *
 * Uses the GitHub CLI (`gh auth login`). Public repos only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalFixture, EvalPr } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const force = process.argv.includes("--force");

function gh<T>(path: string, paginate = false): T {
  const args = ["api", ...(paginate ? ["--paginate", "--slurp"] : []), path];
  const out = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  return (paginate ? (parsed as unknown[][]).flat() : parsed) as T;
}

const { prs } = JSON.parse(readFileSync(join(here, "prs.json"), "utf8")) as { prs: EvalPr[] };
mkdirSync(join(here, "fixtures"), { recursive: true });

for (const pr of prs) {
  const file = join(here, "fixtures", `${pr.id}.json`);
  if (existsSync(file) && !force) continue;

  const pull = gh<{ title: string; body: string | null; html_url: string; head: { sha: string } }>(
    `repos/${pr.repo}/pulls/${pr.number}`,
  );
  const files = gh<
    { filename: string; status: string; additions: number; deletions: number; patch?: string }[]
  >(`repos/${pr.repo}/pulls/${pr.number}/files?per_page=100`, true);

  const fixture: EvalFixture = {
    id: pr.id,
    repo: pr.repo,
    number: pr.number,
    url: pull.html_url,
    headSha: pull.head.sha,
    title: pull.title,
    body: pull.body,
    files: files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
  };
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`fetched ${pr.id} (${fixture.files.length} files)`);
}
