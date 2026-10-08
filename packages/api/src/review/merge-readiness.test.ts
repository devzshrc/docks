import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMergeReadiness } from "./merge-readiness.js";
import { userClient, type MergeSnapshot } from "./github.js";

const snapshot = (): MergeSnapshot => ({
  headRefOid: "a".repeat(40),
  baseRefName: "main",
  baseRef: null,
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  viewerCanMergeAsAdmin: false,
  requirements: { known: true, conversations: false, approvals: 0, checks: [] },
  commits: {
    nodes: [
      {
        commit: {
          statusCheckRollup: {
            contexts: { pageInfo: { hasNextPage: false }, nodes: [] },
          },
        },
      },
    ],
  },
  reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
});

test("optional checks do not block; required checks include action links", () => {
  const s = snapshot();
  const nodes = s.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes;
  nodes.push({
    __typename: "CheckRun",
    name: "lint",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/check",
    isRequired: false,
  });
  assert.equal(computeMergeReadiness(s).state, "ready");
  nodes[0]!.isRequired = true;
  const result = computeMergeReadiness(s);
  assert.equal(result.state, "blocked");
  assert.equal(result.blockers[0]?.url, "https://github.com/check");
});

test("missing checks, required conversations, review decisions and conflicts are explicit", () => {
  const s = snapshot();
  s.requirements = {
    known: true,
    conversations: true,
    approvals: 2,
    checks: ["typecheck"],
  };
  s.reviewThreads.nodes.push({
    id: "t",
    isResolved: false,
    comments: { nodes: [{ url: "https://github.com/thread" }] },
  });
  s.reviewDecision = "REVIEW_REQUIRED";
  s.mergeable = "CONFLICTING";
  assert.deepEqual(
    computeMergeReadiness(s)
      .blockers.map((b) => b.kind)
      .sort(),
    ["check", "conflict", "conversation", "review"],
  );
  s.reviewDecision = "CHANGES_REQUESTED";
  assert.match(
    computeMergeReadiness(s).blockers.find((b) => b.kind === "review")!.title,
    /requested changes/,
  );
});

test("unknown, partial and inaccessible results never report ready", () => {
  assert.equal(computeMergeReadiness(null).state, "unknown");
  const s = snapshot();
  s.reviewThreads.pageInfo.hasNextPage = true;
  assert.equal(computeMergeReadiness(s).state, "unknown");
  s.reviewThreads.pageInfo.hasNextPage = false;
  s.requirements!.known = false;
  assert.equal(computeMergeReadiness(s).state, "unknown");
});

test("merge request binds the operation to the inspected SHA", async () => {
  const original = globalThis.fetch;
  let body: unknown;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ merged: true });
  };
  try {
    await userClient(async () => "test").merge(
      "team/repo",
      1,
      "squash",
      "a".repeat(40),
    );
    assert.deepEqual(body, { merge_method: "squash", sha: "a".repeat(40) });
  } finally {
    globalThis.fetch = original;
  }
});
