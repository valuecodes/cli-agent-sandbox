import { z } from "zod";

export const CliArgsSchema = z.object({
  file: z.string().optional(),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

// OpenAI structured outputs doesn't allow union/anyOf at the root.
// We use one flat schema where `content` holds either the answer or
// a clarifying question, distinguished by `status`.
export const GrantsAgentOutputTypeSchema = z.object({
  response: z.object({
    status: z.enum(["final", "needs_clarification"]),
    content: z.string().min(1),
  }),
});

export const GrantsAgentOutputSchema = GrantsAgentOutputTypeSchema;

export type GrantsAgentOutput = z.infer<typeof GrantsAgentOutputSchema>;

// Single source of truth for one row loaded from the xlsx. Used as a runtime
// validation tripwire in XlsxLoader: if the per-cell normalizers ever produce
// a value that violates this shape (off-by-one bug, schema drift, etc.), the
// loader logs the failing row instead of silently inserting garbage into SQL.
export const GrantRowSchema = z.object({
  decision_date: z.string().nullable(),
  recipient: z.string().nullable(),
  granting_authority: z.string().nullable(),
  case_number: z.string().nullable(),
  amount_applied: z.number().int().nullable(),
  amount_granted: z.number().int().nullable(),
  has_eu_funding: z.union([z.literal(0), z.literal(1)]),
  purpose: z.string().nullable(),
  programme: z.string().nullable(),
  region: z.string().nullable(),
});

export type GrantRow = z.infer<typeof GrantRowSchema>;
