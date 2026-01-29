import { z } from "zod";
import { $ } from "zx";

import type { Logger } from "~clients/logger";

import type { Comment, PrContext, ReviewComment } from "../types/schemas";
import { CommentSchema, ReviewCommentSchema } from "../types/schemas";

$.verbose = false;

type GhClientOptions = {
  logger: Logger;
};

/**
 * Client for GitHub API operations via the gh CLI.
 */
export class GhClient {
  private logger: Logger;

  constructor(options: GhClientOptions) {
    this.logger = options.logger;
  }

  /**
   * Verify gh CLI is authenticated.
   * Exits process if not authenticated.
   */
  async checkAuth(): Promise<void> {
    try {
      await $`gh auth status`.quiet();
    } catch {
      this.logger.error("gh CLI not authenticated. Run 'gh auth login' first.");
      process.exit(1);
    }
  }

  /**
   * Get the repository name (owner/repo format).
   * Uses provided override or detects from current directory.
   */
  async getRepo(repoOverride?: string): Promise<string> {
    if (repoOverride) {
      return repoOverride;
    }
    const result =
      await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.quiet();
    return result.stdout.trim();
  }

  /**
   * Get the PR number for the current branch.
   * Uses provided override or detects from current branch.
   * Exits process if no PR found and no override provided.
   */
  async getPrNumber(prOverride?: number): Promise<number> {
    if (prOverride) {
      return prOverride;
    }
    try {
      const result = await $`gh pr view --json number --jq .number`.quiet();
      return parseInt(result.stdout.trim(), 10);
    } catch {
      this.logger.error(
        "No PR found for current branch. Use --pr=<number> to specify."
      );
      process.exit(1);
    }
  }

  /**
   * Fetch top-level conversation comments from the PR (issue comments API).
   */
  async fetchConversationComments(ctx: PrContext): Promise<Comment[]> {
    const result =
      await $`gh api repos/${ctx.repo}/issues/${ctx.pr}/comments --paginate`.quiet();
    const data: unknown = JSON.parse(result.stdout || "[]");
    return z.array(CommentSchema).parse(data);
  }

  /**
   * Fetch inline review comments from the PR (pull request comments API).
   */
  async fetchReviewComments(ctx: PrContext): Promise<ReviewComment[]> {
    const result =
      await $`gh api repos/${ctx.repo}/pulls/${ctx.pr}/comments --paginate`.quiet();
    const data: unknown = JSON.parse(result.stdout || "[]");
    return z.array(ReviewCommentSchema).parse(data);
  }

  /**
   * Check if codex CLI is available.
   */
  async isCodexAvailable(): Promise<boolean> {
    try {
      await $`which codex`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Launch codex CLI with the given prompt.
   * Returns false if codex is not available.
   */
  async launchCodex(prompt: string): Promise<boolean> {
    if (!(await this.isCodexAvailable())) {
      this.logger.warn("codex CLI not found. Skipping auto-fix step.");
      return false;
    }

    this.logger.info("Launching codex to fix issues...");
    await $({ stdio: "inherit" })`codex ${prompt}`;
    return true;
  }
}
