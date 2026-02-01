import { AgentRunner } from "~clients/agent-runner";
import type { ReviewComment } from "~clients/github-client";
import type { Logger } from "~clients/logger";

import { ANALYSIS_PROMPT_TEMPLATE, MAX_DIFF_CHARS } from "../constants";
import type { AnalysisResult } from "../types/schemas";
import { AnalysisResultSchema } from "../types/schemas";

type CommentAnalyzerOptions = {
  logger: Logger;
};

type AnalyzeOptions = {
  comments: ReviewComment[];
  diff: string;
};

export const truncateDiff = (
  diff: string,
  maxChars: number
): { diff: string; truncated: boolean; originalLength: number } => {
  if (diff.length <= maxChars) {
    return { diff, truncated: false, originalLength: diff.length };
  }

  const truncatedDiff = diff.slice(0, maxChars);
  return {
    diff: `${truncatedDiff}\n\n... [diff truncated to ${maxChars} characters]\n`,
    truncated: true,
    originalLength: diff.length,
  };
};

/**
 * AI-powered comment analyzer that determines if comments are addressed by a diff.
 * Makes a single API call to analyze all comments together.
 */
export class CommentAnalyzer {
  private logger: Logger;

  constructor(options: CommentAnalyzerOptions) {
    this.logger = options.logger;
  }

  async analyze({ comments, diff }: AnalyzeOptions): Promise<AnalysisResult> {
    const commentsJson = JSON.stringify(
      comments.map((c) => ({
        id: c.id,
        path: c.path,
        line: c.line ?? c.original_line,
        body: c.body,
        user: c.user.login,
      })),
      null,
      2
    );

    const truncatedDiff = truncateDiff(diff, MAX_DIFF_CHARS);
    const prompt = ANALYSIS_PROMPT_TEMPLATE(commentsJson, truncatedDiff.diff);

    if (truncatedDiff.truncated) {
      this.logger.warn("Diff truncated for analysis", {
        originalLength: truncatedDiff.originalLength,
        maxChars: MAX_DIFF_CHARS,
      });
    }

    const runner = new AgentRunner<AnalysisResult>({
      name: "comment-analyzer",
      model: "gpt-5-mini",
      tools: [],
      outputType: AnalysisResultSchema,
      instructions:
        "Analyze PR comments to determine if they are addressed by the diff.",
      logger: this.logger,
      stateless: true,
    });

    this.logger.info("Analyzing comments with AI", { count: comments.length });
    const result = await runner.run({ prompt });

    return result.finalOutput as AnalysisResult;
  }
}
