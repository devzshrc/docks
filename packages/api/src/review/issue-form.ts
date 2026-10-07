import { parse } from "yaml";
import type { FormField, FormTemplate } from "./issue.js";

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

/** Parses an issue form. Returns null when the file isn't a usable form (bad YAML, no fields). */
export function parseIssueForm(file: string, text: string): FormTemplate | null {
  let doc: Raw;
  try {
    doc = parse(text) as Raw;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.body)) return null;
  const fields: FormField[] = [];
  for (const [i, item] of (doc.body as Raw[]).entries()) {
    const kind = str(item.type);
    if (kind !== "input" && kind !== "textarea" && kind !== "dropdown" && kind !== "checkboxes") continue; // "markdown" is display-only
    const a = (item.attributes ?? {}) as Raw;
    const v = (item.validations ?? {}) as Raw;
    const options =
      kind === "checkboxes"
        ? ((a.options as Raw[] | undefined) ?? []).map((o) => str(o.label)).filter(Boolean)
        : strs(a.options);
    if (!str(a.label)) continue;
    fields.push({
      id: str(item.id) || `field-${i}`,
      kind,
      label: str(a.label),
      description: str(a.description),
      placeholder: str(a.placeholder),
      required: v.required === true,
      options,
      value: str(a.value),
    });
  }
  if (!fields.length) return null;
  return {
    name: str(doc.name) || file.replace(/\.ya?ml$/i, "").replace(/[-_]/g, " "),
    about: str(doc.description),
    title: str(doc.title),
    labels: strs(doc.labels),
    assignees: strs(doc.assignees),
    fields,
  };
}
