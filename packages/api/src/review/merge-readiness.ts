import type { MergeSnapshot } from "./github.js";

export function computeMergeReadiness(snapshot: MergeSnapshot | null) {
  const blockers: { kind: string; title: string; url?: string }[] = [];
  const warnings: string[] = [];
  const checkedAt = new Date().toISOString();
  if (!snapshot)
    return {
      state: "unknown" as const,
      headSha: null,
      checkedAt,
      blockers,
      warnings: ["Unable to verify GitHub merge requirements."],
    };
  const add = (kind: string, title: string, url?: string | null) =>
    blockers.push({ kind, title, ...(url ? { url } : {}) });
  if (snapshot.state !== "OPEN")
    add("closed", "This pull request is no longer open.");
  if (snapshot.isDraft)
    add("draft", "Mark this pull request ready for review.");
  if (snapshot.mergeable === "CONFLICTING")
    add("conflict", "Resolve conflicts with the base branch.");
  if (snapshot.mergeStateStatus === "BEHIND")
    add("behind", "Update this branch with the base branch.");
  if (snapshot.reviewDecision === "REVIEW_REQUIRED")
    add(
      "review",
      `${snapshot.requirements?.approvals ? `This branch requires ${snapshot.requirements.approvals} approval(s). ` : ""}Required reviews remain. Request an eligible reviewer on GitHub.`,
    );
  if (snapshot.reviewDecision === "CHANGES_REQUESTED")
    add("review", "Address the requested changes and obtain a new review.");
  const contexts =
    snapshot.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  for (const c of contexts?.nodes ?? []) {
    const passed =
      c.__typename === "CheckRun"
        ? c.status === "COMPLETED" &&
          ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(c.conclusion ?? "")
        : c.state === "SUCCESS";
    if (passed) continue;
    const name = c.__typename === "CheckRun" ? c.name : c.context;
    const url = c.__typename === "CheckRun" ? c.detailsUrl : c.targetUrl;
    const pending =
      c.__typename === "CheckRun"
        ? c.status !== "COMPLETED"
        : c.state === "PENDING" || c.state === "EXPECTED";
    if (c.isRequired)
      add(
        "check",
        `Required check ${name} ${pending ? "is pending" : "failed"}.`,
        url,
      );
    else
      warnings.push(
        `Optional check ${name} ${pending ? "is pending" : "failed"}.`,
      );
  }
  // GitHub's aggregate state remains authoritative for rulesets, missing checks and bypass rights.
  const unresolved = snapshot.reviewThreads.nodes.filter((t) => !t.isResolved);
  for (const t of unresolved) {
    if (snapshot.requirements?.conversations)
      add(
        "conversation",
        "Resolve this required review conversation.",
        t.comments.nodes[0]?.url,
      );
    else warnings.push("An unresolved review conversation remains.");
  }
  for (const name of contexts?.pageInfo.hasNextPage
    ? []
    : (snapshot.requirements?.checks ?? [])) {
    if (
      !contexts?.nodes.some(
        (c) =>
          c.isRequired &&
          (c.__typename === "CheckRun" ? c.name : c.context) === name,
      )
    )
      add("check", `Required check ${name} has not reported a result.`);
  }
  if (!snapshot.requirements?.known)
    warnings.push(
      "Unable to verify all branch rules. Inspect requirements on GitHub.",
    );
  const complete =
    !contexts?.pageInfo.hasNextPage &&
    !snapshot.reviewThreads.pageInfo.hasNextPage;
  if (!complete)
    warnings.push(
      "GitHub returned a partial result. Open GitHub for all checks and conversations.",
    );
  if (snapshot.mergeStateStatus === "BLOCKED") {
    if (!blockers.length)
      add(
        "requirements",
        "GitHub reports unmet merge requirements. Inspect branch rules and required checks on GitHub.",
      );
  }
  if (snapshot.viewerCanMergeAsAdmin)
    warnings.push(
      "Your GitHub permissions can permit a rule bypass. GitHub will verify the merge.",
    );
  const ready =
    complete &&
    snapshot.requirements?.known &&
    snapshot.state === "OPEN" &&
    !snapshot.isDraft &&
    snapshot.mergeable === "MERGEABLE" &&
    ["CLEAN", "HAS_HOOKS", "UNSTABLE"].includes(snapshot.mergeStateStatus) &&
    blockers.length === 0;
  return {
    state: blockers.length
      ? ("blocked" as const)
      : ready
        ? ("ready" as const)
        : ("unknown" as const),
    headSha: snapshot.headRefOid,
    checkedAt,
    blockers,
    warnings,
  };
}
