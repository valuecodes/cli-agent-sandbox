import fs from "node:fs/promises";
import { CodexClient } from "~clients/codex-client";
import { GitHubClient } from "~clients/github-client";
import type { Logger } from "~clients/logger";
import { $ } from "zx";

import {
  CODEX_PROMPT_TEMPLATE,
  getAnswersPath,
  getConversationCommentsPath,
  getOutputDir,
  getOutputPath,
  getReviewCommentsPath,
} from "../constants";
import type { CommentAnswer } from "../types/schemas";
import { AnswersFileSchema } from "../types/schemas";
import { CommentFormatter } from "./comment-formatter";

/**
 * Load existing answers from answers.json, returning empty array if not found or invalid.
 */
const loadExistingAnswers = async (
  prNumber: number
): Promise<CommentAnswer[]> => {
  const answersPath = getAnswersPath(prNumber);
  try {
    const content = await fs.readFile(answersPath, "utf-8");
    return AnswersFileSchema.parse(JSON.parse(content));
  } catch {
    return [];
  }
};

/**
 * Merge existing answers with new answers. New answers override existing ones by commentId.
 */
const mergeAnswers = (
  existing: CommentAnswer[],
  newAnswers: CommentAnswer[]
): CommentAnswer[] => {
  const byId = new Map(existing.map((a) => [a.commentId, a]));
  for (const answer of newAnswers) {
    byId.set(answer.commentId, answer);
  }
  return Array.from(byId.values());
};

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
    const githubClient = new GitHubClient({ logger: this.logger });
    const codexClient = new CodexClient({ logger: this.logger });
    const formatter = new CommentFormatter();

    // Verify gh CLI is authenticated
    await githubClient.checkAuth();

    // Resolve PR context
    const repo = await githubClient.getRepo({ repo: options.repo });
    const pr = await githubClient.getPrNumber({ pr: options.pr });
    const ctx = { repo, pr };

    this.logger.info("Fetching comments", ctx);

    // Fetch comments and existing answers in parallel
    const [conversationComments, reviewComments] = await Promise.all([
      githubClient.fetchConversationComments(ctx),
      githubClient.fetchReviewComments(ctx),
    ]);
    const existingAnswers = await loadExistingAnswers(pr);

    // Build set of already-fixed comment IDs
    const fixedIds = new Set(
      existingAnswers.filter((a) => a.fixed).map((a) => a.commentId)
    );

    // Filter to only unfixed review comments
    const unfixedReviewComments = reviewComments.filter(
      (c) => !fixedIds.has(c.id)
    );

    const commentCounts = {
      conversation: conversationComments.length,
      review: reviewComments.length,
    };

    this.logger.info("Found comments", commentCounts);

    if (fixedIds.size > 0) {
      this.logger.info("Skipping already-fixed comments", {
        skipped: fixedIds.size,
        remaining: unfixedReviewComments.length,
      });
    }

    // Format and write output (only unfixed comments for Codex)
    const markdown = formatter.formatMarkdown(
      ctx,
      conversationComments,
      unfixedReviewComments
    );

    const outputDir = getOutputDir(pr);
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = getOutputPath(pr);
    await fs.writeFile(outputPath, markdown, "utf-8");

    // Write JSON files (only unfixed review comments)
    await fs.writeFile(
      getReviewCommentsPath(pr),
      JSON.stringify(unfixedReviewComments, null, 2),
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
    const answersPath = getAnswersPath(pr);

    if (options.codex) {
      // Skip if no unfixed comments
      if (unfixedReviewComments.length === 0) {
        this.logger.info("All comments already fixed, skipping Codex");
      } else {
        const prompt = CODEX_PROMPT_TEMPLATE(outputPath, answersPath);
        codexLaunched = await codexClient.launch({
          prompt,
          context: "fix issues",
        });

        // After Codex completes, merge new answers with existing
        if (codexLaunched) {
          try {
            const newAnswers = await loadExistingAnswers(pr);
            const merged = mergeAnswers(existingAnswers, newAnswers);
            await fs.writeFile(
              answersPath,
              JSON.stringify(merged, null, 2),
              "utf-8"
            );
          } catch {
            // Answers file may not exist if Codex didn't write it
          }
        }
      }
    }

    // Run code quality checks
    await this.runCodeQualityChecks();

    return { outputPath, commentCounts, codexLaunched };
  }

  private async runCodeQualityChecks(): Promise<void> {
    this.logger.info("Running code quality checks...");

    this.logger.info("Running pnpm typecheck");
    await $`pnpm typecheck`;

    this.logger.info("Running pnpm lint");
    await $`pnpm lint`;

    this.logger.info("Running pnpm format");
    await $`pnpm format`;

    this.logger.info("Code quality checks complete");
  }
}
