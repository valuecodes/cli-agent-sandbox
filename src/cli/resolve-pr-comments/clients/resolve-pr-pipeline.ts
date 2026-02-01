import fs from "node:fs/promises";
import { GitHubClient } from "~clients/github-client";
import type { Logger } from "~clients/logger";

import { getAnalysisPath, getOutputDir } from "../constants";
import { CommentAnalyzer } from "./comment-analyzer";
import { CommentResolver } from "./comment-resolver";
import { buildCommentThreadIndex } from "./review-thread-index";

type ResolvePrPipelineOptions = {
  logger: Logger;
};

type RunOptions = {
  pr: number;
  repo?: string;
  dryRun: boolean;
};

type RunResult = {
  totalComments: number;
  addressedCount: number;
  uncertainCount: number;
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
    const analyzer = new CommentAnalyzer({ logger: this.logger });
    const resolver = new CommentResolver({ logger: this.logger });

    await githubClient.checkAuth();

    const repo = await githubClient.getRepo({ repo: options.repo });
    const ctx = { repo, pr: options.pr };

    this.logger.info("Analyzing PR comments", ctx);

    const [reviewComments, diff, reviewThreads] = await Promise.all([
      githubClient.fetchReviewComments(ctx),
      githubClient.fetchPrDiff(ctx),
      githubClient.fetchReviewThreads(ctx),
    ]);

    // Filter out bot's own comments to prevent self-replies
    const botUsername = process.env.GITHUB_ACTOR ?? "github-actions[bot]";
    const humanComments = reviewComments.filter(
      (comment) => comment.user.login !== botUsername
    );

    if (humanComments.length < reviewComments.length) {
      this.logger.debug("Filtered bot comments", {
        botUsername,
        filtered: reviewComments.length - humanComments.length,
      });
    }

    if (humanComments.length === 0) {
      this.logger.info("No review comments to analyze");
      return {
        totalComments: 0,
        addressedCount: 0,
        uncertainCount: 0,
        resolvedCount: 0,
      };
    }

    const commentThreadIndex = buildCommentThreadIndex(reviewThreads);

    // Filter out resolved threads
    const unresolvedComments = humanComments.filter((comment) => {
      const entry = commentThreadIndex.get(comment.id);
      return !entry?.isResolved;
    });

    // Filter out comments already marked with 👍 reaction (previously processed)
    const alreadyAddressedIds = await resolver.getAlreadyAddressedIds(
      ctx,
      unresolvedComments.map((c) => c.id)
    );
    const pendingComments = unresolvedComments.filter(
      (comment) => !alreadyAddressedIds.has(comment.id)
    );

    this.logger.info("Fetched data", {
      totalComments: reviewComments.length,
      botComments: reviewComments.length - humanComments.length,
      unresolvedComments: unresolvedComments.length,
      alreadyAddressed: alreadyAddressedIds.size,
      pendingComments: pendingComments.length,
      diffLength: diff.length,
    });

    if (pendingComments.length === 0) {
      this.logger.info("No pending comments to analyze");
      return {
        totalComments: reviewComments.length,
        addressedCount: 0,
        uncertainCount: 0,
        resolvedCount: 0,
      };
    }

    const analysis = await analyzer.analyze({
      comments: pendingComments,
      diff,
    });

    const outputDir = getOutputDir(options.pr);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      getAnalysisPath(options.pr),
      JSON.stringify(analysis, null, 2),
      "utf-8"
    );

    const commentById = new Map(pendingComments.map((c) => [c.id, c]));
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
        ctx,
        dryRun: options.dryRun,
      });

      if (resolved) {
        resolvedCount++;
      }
    }

    const addressedCount = analysis.analyses.filter(
      (a) => a.status === "addressed"
    ).length;
    const uncertainCount = analysis.analyses.filter(
      (a) => a.status === "uncertain"
    ).length;

    this.logger.info("Resolution complete", {
      totalComments: reviewComments.length,
      addressedCount,
      uncertainCount,
      resolvedCount,
    });

    return {
      totalComments: reviewComments.length,
      addressedCount,
      uncertainCount,
      resolvedCount,
    };
  }
}
