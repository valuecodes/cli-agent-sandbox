import type { Logger } from "~clients/logger";
import { z } from "zod";
import { $ } from "zx";

$.verbose = false;

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
  node_id: z.string(),
  path: z.string(),
  line: z.number().nullable().optional(),
  original_line: z.number().nullable().optional(),
  position: z.number().nullable().optional(),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export type PrContext = {
  repo: string;
  pr: number;
};

type GitHubClientOptions = {
  logger: Logger;
};

type GetRepoOptions = {
  repo?: string;
};

type GetPrNumberOptions = {
  pr?: number;
};

/**
 * Client for GitHub API operations via the GitHub CLI.
 */
export class GitHubClient {
  private logger: Logger;

  constructor(options: GitHubClientOptions) {
    this.logger = options.logger;
  }

  /**
   * Verify gh CLI is authenticated.
   */
  async checkAuth(): Promise<void> {
    this.logger.debug("Checking gh auth status");
    try {
      await $`gh auth status`.quiet();
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        const errorMessage = (error as { message?: unknown }).message;
        const underlyingMessage =
          typeof errorMessage === "string"
            ? errorMessage
            : "Executable not found (ENOENT)";
        throw new Error(
          `Failed to run 'gh'. Make sure the GitHub CLI is installed and on your PATH. Underlying error: ${underlyingMessage}`
        );
      }
      throw new Error("gh CLI not authenticated. Run 'gh auth login' first.");
    }
  }

  /**
   * Get the repository name (owner/repo format).
   * Uses provided override or detects from current directory.
   */
  async getRepo({ repo }: GetRepoOptions = {}): Promise<string> {
    if (repo) {
      this.logger.debug("Using repo override", { repo });
      return repo;
    }
    const result =
      await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.quiet();
    const detectedRepo = result.stdout.trim();
    this.logger.debug("Detected repo", { repo: detectedRepo });
    return detectedRepo;
  }

  /**
   * Get the PR number for the current branch.
   * Uses provided override or detects from current branch.
   */
  async getPrNumber({ pr }: GetPrNumberOptions = {}): Promise<number> {
    if (pr !== undefined) {
      this.logger.debug("Using PR override", { pr });
      return pr;
    }

    // Get current branch name for better error messages
    let branchName = "unknown";
    try {
      const branchResult = await $`git branch --show-current`.quiet();
      branchName = branchResult.stdout.trim();
    } catch {
      // Ignore - we'll use "unknown" in error message
    }

    try {
      // Don't pass --repo flag - it breaks branch-based PR detection
      const result = await $`gh pr view --json number --jq .number`.quiet();
      const detectedPr = parseInt(result.stdout.trim(), 10);
      this.logger.debug("Detected PR number", {
        pr: detectedPr,
        branch: branchName,
      });
      return detectedPr;
    } catch {
      throw new Error(
        `No PR found for branch '${branchName}'. ` +
          `Use --pr=<number> to specify, or create a PR first with 'gh pr create'.`
      );
    }
  }

  /**
   * Fetch top-level conversation comments from the PR (issue comments API).
   */
  async fetchConversationComments(ctx: PrContext): Promise<Comment[]> {
    this.logger.debug("Fetching conversation comments", ctx);
    const result =
      await $`gh api repos/${ctx.repo}/issues/${ctx.pr}/comments --paginate`.quiet();
    const data: unknown = JSON.parse(result.stdout || "[]");
    const comments = z.array(CommentSchema).parse(data);
    this.logger.debug("Fetched conversation comments", {
      count: comments.length,
    });
    return comments;
  }

  /**
   * Fetch inline review comments from the PR (pull request comments API).
   */
  async fetchReviewComments(ctx: PrContext): Promise<ReviewComment[]> {
    this.logger.debug("Fetching review comments", ctx);
    const result =
      await $`gh api repos/${ctx.repo}/pulls/${ctx.pr}/comments --paginate`.quiet();
    const data: unknown = JSON.parse(result.stdout || "[]");
    const comments = z.array(ReviewCommentSchema).parse(data);
    this.logger.debug("Fetched review comments", { count: comments.length });
    return comments;
  }

  /**
   * Reply to a review comment.
   */
  async replyToComment(
    ctx: PrContext,
    commentId: number,
    body: string
  ): Promise<void> {
    this.logger.debug("Replying to comment", { ...ctx, commentId });
    await $`gh api repos/${ctx.repo}/pulls/${ctx.pr}/comments/${commentId}/replies -f body=${body}`.quiet();
    this.logger.debug("Reply posted", { commentId });
  }

  /**
   * Resolve a review thread using GraphQL mutation.
   * The threadId is the node_id of any comment in the thread.
   */
  async resolveThread(threadId: string): Promise<void> {
    this.logger.debug("Resolving thread", { threadId });
    const mutation = `
      mutation ResolveThread($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread { isResolved }
        }
      }
    `;
    await $`gh api graphql -f query=${mutation} -f threadId=${threadId}`.quiet();
    this.logger.debug("Thread resolved", { threadId });
  }
}
