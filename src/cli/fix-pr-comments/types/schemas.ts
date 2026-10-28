import { z } from "zod";

// CLI arguments schema
const CliArgsSchema = z.object({
  pr: z.coerce.number().optional(),
  repo: z.string().optional(),
  codex: z.coerce.boolean().default(true), // --no-codex sets to false
});

// Schema for Codex answer output
const CommentAnswerSchema = z.object({
  commentId: z.number(),
  fixed: z.boolean(),
});

type CommentAnswer = z.infer<typeof CommentAnswerSchema>;

const AnswersFileSchema = z.array(CommentAnswerSchema);

// Re-export shared types from github-client
export type { Comment, PrContext, ReviewComment } from "~clients/github-client";
export type { CommentAnswer };
export { AnswersFileSchema, CliArgsSchema, CommentAnswerSchema };
