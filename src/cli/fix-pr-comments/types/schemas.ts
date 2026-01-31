import { z } from "zod";

// CLI arguments schema
export const CliArgsSchema = z.object({
  pr: z.coerce.number().optional(),
  repo: z.string().optional(),
  codex: z.coerce.boolean().default(true), // --no-codex sets to false
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

// GitHub API response schemas
const CommentUserSchema = z.object({
  login: z.string(),
});

export const CommentSchema = z.object({
  created_at: z.string(),
  user: CommentUserSchema,
  body: z.string(),
  html_url: z.string(),
});

export type Comment = z.infer<typeof CommentSchema>;

export const ReviewCommentSchema = CommentSchema.extend({
  id: z.number(),
  path: z.string(),
  line: z.number().nullable().optional(),
  original_line: z.number().nullable().optional(),
  position: z.number().nullable().optional(),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

// PR context type for passing between components
export type PrContext = {
  repo: string;
  pr: number;
};

// Schema for Codex answer output
export const CommentAnswerSchema = z.object({
  commentId: z.number(),
  fixed: z.boolean(),
});

export type CommentAnswer = z.infer<typeof CommentAnswerSchema>;

export const AnswersFileSchema = z.array(CommentAnswerSchema);
