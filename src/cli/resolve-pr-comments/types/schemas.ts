import { z } from "zod";

const CliArgsSchema = z.object({
  pr: z.coerce.number(),
  repo: z.string().optional(),
  dryRun: z.coerce.boolean().default(false),
});

const CommentStatusSchema = z.enum(["addressed", "uncertain", "not_addressed"]);

const CommentAnalysisSchema = z.object({
  commentId: z.number(),
  status: CommentStatusSchema,
  reasoning: z.string(),
  suggestedReply: z.string(),
});

type CommentAnalysis = z.infer<typeof CommentAnalysisSchema>;

const AnalysisResultSchema = z.object({
  analyses: z.array(CommentAnalysisSchema),
});

type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export type { PrContext } from "~clients/github-client";
export type { AnalysisResult, CommentAnalysis };
export {
  AnalysisResultSchema,
  CliArgsSchema,
  CommentAnalysisSchema,
  CommentStatusSchema,
};
