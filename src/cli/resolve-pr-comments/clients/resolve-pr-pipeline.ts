import fs from "node:fs/promises";
import { GitClient } from "~clients/git-client";
import { GitHubClient } from "~clients/github-client";
import type { Logger } from "~clients/logger";

import { getAnalysisPath, getOutputDir } from "../constants";
import { CommentAnalyzer } from "./comment-analyzer";
import { CommentResolver } from "./comment-resolver";

type ResolvePrPipelineOptions = {
  logger: Logger;
};

type RunOptions = {
  pr: number;
  repo?: string;
  base: string;
  dryRun: boolean;
};

type RunResult = {
  totalComments: number;
  addressedCount: number;
  resolvedCount: number;
};

/**
 * Orchestrates the PR comment resolution workflow:
 * 1. Fetch review comments and git diff
 * 2. Analyze comments with AI (single request)
 * 3. Reply to and resolve addressed comments
 */
export class ResolvePrPipeline {
  private logger: Logger;

  constructor(options: ResolvePrPipelineOptions) {
    this.logger = options.logger;
  }

  async run(options: RunOptions): Promise<RunResult> {
    const githubClient = new GitHubClient({ logger: this.logger });
    const gitClient = new GitClient({ logger: this.logger });
    const analyzer = new CommentAnalyzer({ logger: this.logger });
    const resolver = new CommentResolver({ logger: this.logger });

    await githubClient.checkAuth();

    const repo = await githubClient.getRepo({ repo: options.repo });
    const ctx = { repo, pr: options.pr };

    this.logger.info("Analyzing PR comments", ctx);

    const [reviewComments, diff] = await Promise.all([
      githubClient.fetchReviewComments(ctx),
      gitClient.getDiff({ base: options.base }),
    ]);

    if (reviewComments.length === 0) {
      this.logger.info("No review comments to analyze");
      return { totalComments: 0, addressedCount: 0, resolvedCount: 0 };
    }

    this.logger.info("Fetched data", {
      comments: reviewComments.length,
      diffLength: diff.length,
    });

    const analysis = await analyzer.analyze({
      comments: reviewComments,
      diff,
    });

    const outputDir = getOutputDir(options.pr);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      getAnalysisPath(options.pr),
      JSON.stringify(analysis, null, 2),
      "utf-8"
    );

    const commentById = new Map(reviewComments.map((c) => [c.id, c]));
    let resolvedCount = 0;

    for (const commentAnalysis of analysis.analyses) {
      const comment = commentById.get(commentAnalysis.commentId);
      if (!comment) {
        this.logger.warn("Comment not found", {
          commentId: commentAnalysis.commentId,
        });
        continue;
      }

      const resolved = await resolver.resolveComment({
        analysis: commentAnalysis,
        comment,
        ctx,
        dryRun: options.dryRun,
      });

      if (resolved) {
        resolvedCount++;
      }
    }

    const addressedCount = analysis.analyses.filter(
      (a) => a.isAddressed
    ).length;

    this.logger.info("Resolution complete", {
      totalComments: reviewComments.length,
      addressedCount,
      resolvedCount,
    });

    return {
      totalComments: reviewComments.length,
      addressedCount,
      resolvedCount,
    };
  }
}
