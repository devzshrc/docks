import type { RoutingRule } from "@docks/db";

/** Glob over repo paths: `**` crosses folders, `*` doesn't, "dir/" means everything under it, a slashless glob matches any file name. */
export function globToRegExp(glob: string): RegExp {
  let g = glob.trim();
  if (g.endsWith("/")) g += "**";
  const anywhere = !g.includes("/");
  const body = g
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(anywhere ? `(^|/)${body}$` : `^${body}$`);
}

export interface PrFacts {
  paths: string[];
  lines: number;
}

/** A rule fires when every condition it has holds (path globs: any changed file matches any glob). */
export function ruleMatches(rule: RoutingRule, pr: PrFacts): boolean {
  const hasPaths = rule.paths.length > 0;
  const hasSize = rule.minLines !== null;
  if (!hasPaths && !hasSize) return false; // a rule with no condition would fire on every PR
  if (hasPaths) {
    const res = rule.paths.map(globToRegExp);
    if (!pr.paths.some((p) => res.some((re) => re.test(p)))) return false;
  }
  if (hasSize && pr.lines < rule.minLines!) return false;
  return true;
}

/** Rules that match and haven't been applied to this PR yet, in order. */
export function dueRules(rules: RoutingRule[], applied: string[], pr: PrFacts): RoutingRule[] {
  return rules.filter((r) => !applied.includes(r.id) && ruleMatches(r, pr));
}

/** Rules that apply to a new issue: path rules only (a size condition means nothing before there is a PR). */
export function issueRules(rules: RoutingRule[], paths: string[]): RoutingRule[] {
  return rules.filter((r) => r.minLines === null && r.paths.length > 0 && ruleMatches(r, { paths, lines: 0 }));
}
