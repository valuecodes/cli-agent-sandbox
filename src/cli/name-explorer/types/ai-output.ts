import { z } from "zod";

// OpenAI structured outputs doesn't support union/anyOf at root level,
// and doesn't support optional fields. Solution: use a flat schema with
// all fields required, where "content" holds either the answer or clarifying question.
export const NameSuggesterOutputTypeSchema = z.object({
  response: z.object({
    status: z.enum(["final", "needs_clarification"]),
    content: z.string().min(1),
  }),
});

// For parsing - same structure
export const NameSuggesterOutputSchema = NameSuggesterOutputTypeSchema;

export type NameSuggesterOutput = z.infer<typeof NameSuggesterOutputSchema>;
