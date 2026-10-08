import { z } from "zod";

export const sessionData = z
  .object({
    textDrafts: z
      .record(z.string().min(1).max(1200), z.string().max(65_000))
      .refine((v) => Object.keys(v).length <= 200, "Too many drafts"),
    pending: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          path: z.string().min(1).max(500),
          line: z.number().int().positive(),
          startLine: z.number().int().positive().optional(),
          side: z.enum(["LEFT", "RIGHT"]),
          body: z.string().max(65_000),
          headSha: z.string().regex(/^[a-f0-9]{40}$/),
        }),
      )
      .max(100),
    checklist: z.object({
      revision: z.string().max(100_000),
      checked: z.array(z.string().max(5000)).max(100),
      answers: z.record(z.string().max(5000), z.object({ headSha: z.string().regex(/^[a-f0-9]{40}$/), files: z.record(z.string().max(500), z.string().max(100)).refine((v) => Object.keys(v).length <= 100) })).refine((v) => Object.keys(v).length <= 100).optional(),
    }),
    lastLocation: z
      .object({
        path: z.string().max(500),
        line: z.number().int().positive().optional(),
      })
      .nullable(),
  })
  .refine(
    (v) => JSON.stringify(v).length <= 500_000,
    "Review session exceeds the 500 KB limit",
  );

export const emptySession = () => ({
  textDrafts: {},
  pending: [],
  checklist: { revision: "", checked: [] },
  lastLocation: null,
});
