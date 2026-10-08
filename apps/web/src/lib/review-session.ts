import type { ReviewSessionData } from "@docks/api";

export function parseRecovery(raw: string | null): { version: number; data: ReviewSessionData; dirty: boolean } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const data = value?.data;
    if (!Number.isInteger(value?.version) || value.version < 0 || typeof value.dirty !== "boolean" || !data || !data.textDrafts || Array.isArray(data.textDrafts) || !Object.values(data.textDrafts).every((v) => typeof v === "string") || !Array.isArray(data.pending) || !data.pending.every((c: ReviewSessionData["pending"][number]) => c && typeof c.id === "string" && typeof c.path === "string" && typeof c.body === "string" && Number.isInteger(c.line) && c.line > 0 && ["LEFT", "RIGHT"].includes(c.side) && typeof c.headSha === "string") || typeof data.checklist?.revision !== "string" || !Array.isArray(data.checklist.checked) || !data.checklist.checked.every((id: unknown) => typeof id === "string") || !(data.lastLocation === null || (typeof data.lastLocation?.path === "string" && (data.lastLocation.line === undefined || (Number.isInteger(data.lastLocation.line) && data.lastLocation.line > 0))))) return null;
    const answers = data.checklist.answers;
    if (answers !== undefined && (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).length > 100 || !Object.values(answers).every((a: unknown) => {
      const answer = a as { headSha?: unknown; files?: unknown } | null;
      return answer && typeof answer.headSha === "string" && /^[a-f0-9]{40}$/.test(answer.headSha) && answer.files && typeof answer.files === "object" && !Array.isArray(answer.files) && Object.values(answer.files).every((sha) => typeof sha === "string");
    }))) return null;
    return value;
  } catch { return null; }
}
