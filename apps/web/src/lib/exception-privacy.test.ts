import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeException } from "./exception-privacy";

test("exception redaction preserves stack locations and drops credentials and source context", () => {
  const result = sanitizeException({
    message: "token=private user@example.com Bearer abc.secret",
    stack: {
      frames: [
        {
          filename: "https://example.com/chunk.js?token=private#secret",
          lineno: 42,
          context_line: "customer source",
          vars: { secret: "private" },
        },
      ],
    },
  });
  const text = JSON.stringify(result);
  assert.ok(!/private|user@example.com|customer source|abc.secret/.test(text));
  assert.match(text, /chunk.js/);
  assert.match(text, /42/);
});
