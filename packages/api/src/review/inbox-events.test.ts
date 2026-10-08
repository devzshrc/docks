import assert from "node:assert/strict";
import { test } from "node:test";
import { inboxEvents, recipientLogins } from "./inbox-events.js";

test("only actionable webhook events become inbox events", () => {
  const pull = { number: 1, title: "Change", head: { sha: "a".repeat(40) } };
  assert.equal(
    inboxEvents("pull_request", { action: "opened", pull_request: pull }, "1")
      .length,
    0,
  );
  assert.equal(
    inboxEvents(
      "pull_request",
      {
        action: "review_requested",
        pull_request: pull,
        requested_reviewer: { login: "Reviewer" },
      },
      "1",
    )[0]?.kind,
    "review_requested",
  );
  assert.equal(
    inboxEvents(
      "pull_request_review_comment",
      { action: "created", pull_request: pull, comment: { id: 2 } },
      "1",
    ).length,
    0,
  );
  assert.equal(
    inboxEvents(
      "pull_request_review_comment",
      {
        action: "created",
        pull_request: pull,
        comment: { id: 2, in_reply_to_id: 1 },
      },
      "1",
    )[0]?.kind,
    "thread_reply",
  );
  assert.equal(
    inboxEvents(
      "check_run",
      {
        action: "completed",
        check_run: {
          id: 5,
          conclusion: "success",
          pull_requests: [{ number: 1 }],
        },
      },
      "1",
    ).length,
    0,
  );
});

test("event identity survives webhook redelivery", () => {
  const payload = {
    action: "submitted",
    pull_request: { number: 1 },
    review: { id: 4 },
  };
  assert.equal(
    inboxEvents("pull_request_review", payload, "first")[0]?.sourceKey,
    inboxEvents("pull_request_review", payload, "retry")[0]?.sourceKey,
  );
});

test("failed commit statuses create head-scoped events", () => {
  const payload = {
    pull_request: { number: 7 },
    sha: "b".repeat(40),
    state: "failure",
    context: "build",
    target_url: "https://example.com/build",
  };
  const event = inboxEvents("status", payload, "delivery")[0];
  assert.equal(event?.kind, "check_failed");
  assert.equal(event?.context.headSha, payload.sha);
  assert.equal(event?.context.url, payload.target_url);
  assert.equal(
    inboxEvents("status", { ...payload, state: "success" }, "delivery").length,
    0,
  );
  assert.equal(
    inboxEvents("status", payload, "delivery")[0]?.sourceKey,
    event?.sourceKey,
  );
});

test("recipient selection excludes actors, authors reviewing themselves and current-head reviews", () => {
  const context = {
    title: "PR",
    actor: "ALICE",
    headSha: "new",
    url: null,
    requestedLogin: "Alice",
    replyTo: null,
  };
  const input = {
    author: "author",
    requested: [],
    reviews: [
      { login: "Alice", commit: "old" },
      { login: "Bob", commit: "old" },
      { login: "Carol", commit: "new" },
      { login: "Author", commit: "old" },
    ],
    participants: ["alice", "BOB", "bob"],
  };
  assert.deepEqual(recipientLogins("new_commit", context, input), ["bob"]);
  assert.deepEqual(recipientLogins("thread_reply", context, input), ["bob"]);
  assert.deepEqual(recipientLogins("review_requested", context, input), []);
});
