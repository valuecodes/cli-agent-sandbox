import fs from "node:fs/promises";
import type { Logger } from "~clients/logger";

import {
  CODEX_PROMPT_TEMPLATE,
  getConversationCommentsPath,
  getOutputDir,
  getOutputPath,
  getReviewCommentsPath,
} from "../constants";
import { CommentFormatter } from "./comment-formatter";
import { GhClient } from "./gh-client";

type FixPrPipelineOptions = {
  logger: Logger;
};

type RunOptions = {
  pr?: number;
  repo?: string;
  codex: boolean;
};

type RunResult = {
  outputPath: string;
  commentCounts: { conversation: number; review: number };
  codexLaunched: boolean;
};

/**
 * Orchestrates fetching PR comments and optionally launching codex.
 */
export class FixPrPipeline {
  private logger: Logger;

  constructor(options: FixPrPipelineOptions) {
    this.logger = options.logger;
  }

  async run(options: RunOptions): Promise<RunResult> {
    const ghClient = new GhClient({ logger: this.logger });
    const formatter = new CommentFormatter();

    // Verify gh CLI is authenticated
    await ghClient.checkAuth();

    // Resolve PR context
    const repo = await ghClient.getRepo(options.repo);
    const pr = await ghClient.getPrNumber(options.pr);
    const ctx = { repo, pr };

    this.logger.info("Fetching comments", ctx);

    // Fetch comments in parallel
    const [conversationComments, reviewComments] = await Promise.all([
      ghClient.fetchConversationComments(ctx),
      ghClient.fetchReviewComments(ctx),
    ]);

    const commentCounts = {
      conversation: conversationComments.length,
      review: reviewComments.length,
    };

    this.logger.info("Found comments", commentCounts);

    // Format and write output
    const markdown = formatter.formatMarkdown(
      ctx,
      conversationComments,
      reviewComments
    );

    const outputDir = getOutputDir(pr);
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = getOutputPath(pr);
    await fs.writeFile(outputPath, markdown, "utf-8");

    // Write JSON files
    await fs.writeFile(
      getReviewCommentsPath(pr),
      JSON.stringify(reviewComments, null, 2),
      "utf-8"
    );
    await fs.writeFile(
      getConversationCommentsPath(pr),
      JSON.stringify(conversationComments, null, 2),
      "utf-8"
    );

    this.logger.info("Comments written", { path: outputPath });

    // Launch codex if enabled
    let codexLaunched = false;
    if (options.codex) {
      const prompt = CODEX_PROMPT_TEMPLATE(outputPath);
      codexLaunched = await ghClient.launchCodex(prompt);
    }

    return { outputPath, commentCounts, codexLaunched };
  }
}
