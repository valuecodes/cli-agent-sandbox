import { z } from "zod";

export type { PrContext, ReviewComment } from "~clients/github-client";

export const CliArgsSchema = z.object({
  pr: z.coerce.number(),
  repo: z.string().optional(),
  base: z.string().default("main"),
  dryRun: z.coerce.boolean().default(false),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

export const CommentAnalysisSchema = z.object({
  commentId: z.number(),
  isAddressed: z.boolean(),
  reasoning: z.string(),
  suggestedReply: z.string(),
});

export type CommentAnalysis = z.infer<typeof CommentAnalysisSchema>;

export const AnalysisResultSchema = z.object({
  analyses: z.array(CommentAnalysisSchema),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
