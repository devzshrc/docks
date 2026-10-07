import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIssueForm } from "./issue-form.js";
import { compileForm, missingForm } from "./issue.js";

const YAML = `
name: Bug report
description: Something broke
title: "[Bug]: "
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes: { value: "Thanks!" }
  - type: textarea
    id: what
    attributes: { label: What happened?, placeholder: Tell us }
    validations: { required: true }
  - type: dropdown
    id: version
    attributes: { label: Version, options: ["1.0", "2.0"] }
  - type: checkboxes
    id: terms
    attributes:
      label: Checks
      options:
        - label: I searched existing issues
`;

test("issue forms parse into fields, skipping display-only blocks", () => {
  const f = parseIssueForm("bug.yml", YAML)!;
  assert.equal(f.name, "Bug report");
  assert.equal(f.title, "[Bug]: ");
  assert.deepEqual(f.labels, ["bug", "triage"]);
  assert.deepEqual(f.fields.map((x) => [x.id, x.kind, x.required]), [["what", "textarea", true], ["version", "dropdown", false], ["terms", "checkboxes", false]]);
  assert.deepEqual(f.fields[1]!.options, ["1.0", "2.0"]);
  assert.deepEqual(f.fields[2]!.options, ["I searched existing issues"]);
});

test("bad or empty forms are rejected", () => {
  assert.equal(parseIssueForm("x.yml", "{{{"), null);
  assert.equal(parseIssueForm("x.yml", "name: x\nbody: []"), null);
  assert.equal(parseIssueForm("x.yml", "just: text"), null);
});

test("forms compile like GitHub's: headings, _No response_, checked boxes", () => {
  const f = parseIssueForm("bug.yml", YAML)!;
  const body = compileForm(f.fields, { what: "It broke", version: "2.0", terms: "I searched existing issues" });
  assert.equal(body, "### What happened?\n\nIt broke\n\n### Version\n\n2.0\n\n### Checks\n\n- [x] I searched existing issues");
  assert.match(compileForm(f.fields, {}), /### What happened\?\n\n_No response_/);
  assert.deepEqual(missingForm(f.fields, {}), ["What happened?"]);
});
