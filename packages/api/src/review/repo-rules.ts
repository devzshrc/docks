import { createHash } from "node:crypto";
import { db, schema, type RepoRules } from "@docks/db";
import { and, eq } from "drizzle-orm";
import { parse } from "yaml";
import { z } from "zod/v4";
import { GitHubError } from "./github.js";
import { tierOf } from "./risk.js";
import { globToRegExp } from "./rules.js";
import type { RiskTier } from "./types.js";

/**
 * Per-repo rules in `.github/docks.yml` on the default branch: risk-tier
 * overrides and extra checklist questions. Versioned and reviewed like code;
 * built-in defaults apply when the file is missing.
 */
export const RULES_PATH = ".github/docks.yml";
/** How long a read of the rules file is trusted before sync checks again. */
const RULES_TTL_MS = 15 * 60_000;

const globs = z.array(z.string().trim().min(1).max(200)).max(100);
const RulesFile = z
  .object({
    tiers: z
      .object({ core: globs, config: globs, test: globs, noise: globs })
      .partial()
      .strict()
      .default({}),
    checklist: z
      .array(
        z.object({
          paths: globs.min(1),
          question: z.string().trim().min(3).max(300),
        }),
      )
      .max(30)
      .default([]),
  })
  .strict();

export function parseRepoRules(text: string): { rules: RepoRules } | { error: string } {
  let raw: unknown;
  try {
    raw = parse(text) ?? {};
  } catch (err) {
    return { error: `Not valid YAML: ${(err as Error).message.split("\n")[0]}` };
  }
  const result = RulesFile.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    return { error: `${issue.path.join(".") || "file"}: ${issue.message}` };
  }
  return { rules: result.data };
}

/** `**\/x` should also match `x` at the repo root. */
function matches(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path) || (glob.startsWith("**/") && globToRegExp(glob.slice(3)).test(path));
}

/** Most specific tier first: an explicit noise rule beats a broad core rule. */
const ORDER: RiskTier[] = ["noise", "test", "config", "core"];

/** Repo rules first, then the built-in defaults. */
export function tierWithRules(path: string, rules: RepoRules | null | undefined): RiskTier {
  for (const tier of ORDER) if (rules?.tiers[tier]?.some((g) => matches(g, path))) return tier;
  return tierOf(path);
}

/** Checklist questions whose paths match any changed file. */
export function rulesChecklist(rules: RepoRules | null | undefined, paths: string[]): string[] {
  return (rules?.checklist ?? [])
    .filter((c) => c.paths.some((g) => paths.some((p) => matches(g, p))))
    .map((c) => c.question);
}

export async function storedRepoRules(repoId: number) {
  const [row] = await db.select().from(schema.repositoryRules).where(eq(schema.repositoryRules.repoId, repoId)).limit(1);
  return row ?? null;
}

/**
 * Rules for a repo, re-reading the file when the last read is stale (or `force`).
 * An invalid file never breaks review: the last valid rules stay in effect.
 */
export async function repoRules(
  repoId: number,
  gh: { fileContent: (repo: string, path: string, ref?: string) => Promise<string> },
  fullName: string,
  { force = false, now = new Date() } = {},
): Promise<RepoRules | null> {
  const stored = await storedRepoRules(repoId);
  if (stored && !force && now.getTime() - stored.checkedAt.getTime() < RULES_TTL_MS) return stored.rules;

  let text: string | null;
  try {
    text = await gh.fileContent(fullName, RULES_PATH);
  } catch (err) {
    if (!(err instanceof GitHubError && err.status === 404)) return stored?.rules ?? null; // transient: keep what we had
    text = null;
  }
  const fileSha = text === null ? null : createHash("sha1").update(text).digest("hex");
  const parsed = text === null ? null : parseRepoRules(text);
  const rules = parsed === null ? null : "rules" in parsed ? parsed.rules : (stored?.rules ?? null);
  const error = parsed && "error" in parsed ? parsed.error : null;

  await db
    .insert(schema.repositoryRules)
    .values({ repoId, fileSha, rules, error, checkedAt: now })
    .onConflictDoUpdate({
      target: schema.repositoryRules.repoId,
      set: { fileSha, rules, error, checkedAt: now, updatedAt: now },
    });
  if (JSON.stringify(rules) !== JSON.stringify(stored?.rules ?? null)) await retierOpenPrs(repoId, rules);
  return rules;
}

/** Rules changed: recompute stored tiers for open PRs' current files. No GitHub calls. */
export async function retierOpenPrs(repoId: number, rules: RepoRules | null) {
  const files = await db
    .select({ prNumber: schema.prFile.prNumber, headSha: schema.prFile.headSha, path: schema.prFile.path, tier: schema.prFile.tier })
    .from(schema.prFile)
    .innerJoin(
      schema.pullRequest,
      and(
        eq(schema.pullRequest.repoId, schema.prFile.repoId),
        eq(schema.pullRequest.number, schema.prFile.prNumber),
        eq(schema.pullRequest.headSha, schema.prFile.headSha),
      ),
    )
    .where(and(eq(schema.prFile.repoId, repoId), eq(schema.pullRequest.state, "open")));
  for (const f of files) {
    const tier = tierWithRules(f.path, rules);
    if (tier === f.tier) continue;
    await db
      .update(schema.prFile)
      .set({ tier })
      .where(
        and(
          eq(schema.prFile.repoId, repoId),
          eq(schema.prFile.prNumber, f.prNumber),
          eq(schema.prFile.headSha, f.headSha),
          eq(schema.prFile.path, f.path),
        ),
      );
  }
}

/**
 * A suggested rules file from the repo's layout. Only rules that match
 * something in the tree are included, so the file explains this repo.
 */
export function starterRulesYaml(paths: string[]): string {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const has = (re: RegExp) => [...dirs].filter((d) => re.test(d));
  const top = (re: RegExp) => [...new Set(has(re).map((d) => d.match(re)![0]))].sort();
  const lines = (globs: string[]) => globs.map((g) => `"${g}"`).join(", ");
  const tiers: Record<string, string[]> = {};

  // Monorepo packages: their src folders are the code that matters.
  const monorepo = top(/^(apps|packages|services|libs)\/[^/]+(?=\/src$)/);
  if (monorepo.length) tiers.core = [...new Set(monorepo.map((d) => `${d.split("/")[0]}/*/src/**`))];
  const generated = top(/(^|.*\/)(gen|generated|__generated__|codegen)$/).map((d) => `${d}/`);
  const genFiles = ["*.pb.go", "*_pb2.py", "*.generated.ts", "*.gen.go"].filter((g) => paths.some((p) => globToRegExp(g).test(p)));
  if (generated.length || genFiles.length) tiers.noise = [...generated, ...genFiles.map((g) => `**/${g}`)];
  const infra = top(/^(infra|deploy|terraform|k8s|helm|charts|ops)$/).map((d) => `${d}/`);
  if (infra.length) tiers.config = infra;
  const fixtures = top(/(^|.*\/)(testdata|fixtures|__fixtures__|__snapshots__)$/).map((d) => `${d}/`);
  if (fixtures.length) tiers.test = fixtures;

  const checklist: { paths: string[]; question: string }[] = [];
  const migrations = top(/(^|.*\/)(migrations|drizzle|alembic\/versions|db\/migrate|prisma\/migrations)$/).map((d) => `${d}/`);
  if (migrations.length) checklist.push({ paths: migrations, question: "Does this migration handle existing rows, and can it be rolled back?" });
  const auth = top(/(^|.*\/)(auth|authentication|permissions?|access)$/).map((d) => `${d}/`);
  if (auth.length) checklist.push({ paths: auth, question: "Could this change let someone see or do more than they should?" });
  const billing = top(/(^|.*\/)(billing|payments?|invoices?)$/).map((d) => `${d}/`);
  if (billing.length) checklist.push({ paths: billing, question: "Are money amounts, currencies and retries handled exactly once?" });
  const ci = paths.some((p) => p.startsWith(".github/workflows/")) ? [".github/workflows/"] : [];
  if (ci.length) checklist.push({ paths: ci, question: "Does this CI change keep secrets out of logs and pull requests from forks?" });

  const out = [
    "# Docks review rules: ranks files and adds checklist questions for this repository.",
    "# Generated from the repository layout; edit freely. Docs: Settings → Repositories → Review rules.",
  ];
  const tierKeys = Object.keys(tiers);
  if (tierKeys.length) {
    out.push("tiers:");
    for (const k of ["core", "config", "test", "noise"]) if (tiers[k]) out.push(`  ${k}: [${lines(tiers[k]!)}]`);
  } else out.push("tiers: {}");
  if (checklist.length) {
    out.push("checklist:");
    for (const c of checklist) out.push(`  - paths: [${lines(c.paths)}]`, `    question: "${c.question}"`);
  } else out.push("checklist: []");
  return `${out.join("\n")}\n`;
}
