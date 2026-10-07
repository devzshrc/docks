/** References to issues in a PR's text: GitHub closing keywords and #n, plus Linear identifiers (ENG-123). */

// Words that look like Linear ids but aren't (UTF-8, SHA-256, CVE-2024-…).
const NOT_LINEAR = new Set(["UTF", "SHA", "CVE", "ISO", "RFC", "HTTP", "MD", "AES", "RSA", "TLS", "SSL", "PEP", "GPT", "X", "H", "B", "ES", "IPV", "WCAG", "CSS"]);

export function linearIds(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    for (const m of (text ?? "").matchAll(/\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g)) {
      if (!NOT_LINEAR.has(m[1]!)) out.add(`${m[1]}-${m[2]}`);
    }
  }
  return [...out].slice(0, 5);
}

/** Branch names are lowercase in Linear's convention: "eng-123-fix-login". */
export function linearIdFromBranch(branch: string): string | null {
  const m = branch.match(/(?:^|\/)([a-z][a-z0-9]{1,9})-(\d{1,6})(?:-|$)/);
  return m && !NOT_LINEAR.has(m[1]!.toUpperCase()) ? `${m[1]!.toUpperCase()}-${m[2]}` : null;
}

/** #123 mentions in the same repo (not "owner/repo#123", not the PR itself). */
export function issueMentions(text: string | null | undefined, self: number): number[] {
  const out = new Set<number>();
  for (const m of (text ?? "").matchAll(/(?<![\w/])#(\d{1,7})\b/g)) {
    const n = Number(m[1]);
    if (n !== self) out.add(n);
  }
  return [...out].slice(0, 5);
}

/** Issue number from a branch like `fix/123-login-bug`, `feat/123`, `issue-123-x` (what "New issue" suggests). */
export function issueFromBranch(branch: string): number | null {
  const m = branch.match(/^(?:fix|feat|feature|chore|bug|bugfix|hotfix)\/(\d{1,7})(?:-|$)/i) ?? branch.match(/(?:^|\/)(?:issue|gh)-(\d{1,7})(?:-|$)/i);
  return m ? Number(m[1]) : null;
}
