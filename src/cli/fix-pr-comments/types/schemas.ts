import { z } from "zod";

// Re-export shared types from github-client
export type { Comment, PrContext, ReviewComment } from "~clients/github-client";

// CLI arguments schema
export const CliArgsSchema = z.object({
  pr: z.coerce.number().optional(),
  repo: z.string().optional(),
  codex: z.coerce.boolean().default(true), // --no-codex sets to false
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

// Schema for Codex answer output
export const CommentAnswerSchema = z.object({
  commentId: z.number(),
  fixed: z.boolean(),
});

export type CommentAnswer = z.infer<typeof CommentAnswerSchema>;

export const AnswersFileSchema = z.array(CommentAnswerSchema);
