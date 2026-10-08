export interface ChecklistAnswer {
  headSha: string;
  files: Record<string, string>;
}
/** A new commit preserves a check only when every linked file has the same blob. */
export function answerStillValid(
  answer: ChecklistAnswer,
  files: string[],
  headSha: string,
  fileShas: Record<string, string>,
  paid: boolean,
) {
  if (!paid || !files.length) return answer.headSha === headSha;
  return files.every(
    (path) =>
      Boolean(answer.files[path]) && answer.files[path] === fileShas[path],
  );
}
