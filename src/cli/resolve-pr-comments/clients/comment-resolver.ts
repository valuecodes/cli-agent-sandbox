import { GitHubClient } from "~clients/github-client";
import type { Logger } from "~clients/logger";

import type { CommentAnalysis, PrContext } from "../types/schemas";

type CommentResolverOptions = {
  logger: Logger;
};

type ResolveOptions = {
  analysis: CommentAnalysis;
  ctx: PrContext;
  dryRun: boolean;
  threadId?: string;
};

/**
 * Handles GitHub API operations for replying to and resolving PR comments.
 */
export class CommentResolver {
  private githubClient: GitHubClient;
  private logger: Logger;

  constructor(options: CommentResolverOptions) {
    this.logger = options.logger;
    this.githubClient = new GitHubClient({ logger: options.logger });
  }

  async resolveComment({
    analysis,
    ctx,
    dryRun,
    threadId,
  }: ResolveOptions): Promise<boolean> {
    if (analysis.status === "not_addressed") {
      this.logger.debug("Skipping unaddressed comment", {
        commentId: analysis.commentId,
      });
      return false;
    }

    const replyBody = analysis.suggestedReply;
    const willResolve = analysis.status === "addressed";

    if (dryRun) {
      this.logger.info(
        willResolve
          ? "[DRY RUN] Would reply and resolve"
          : "[DRY RUN] Would reply (uncertain, not resolving)",
        {
          commentId: analysis.commentId,
          status: analysis.status,
          reply: replyBody,
          reasoning: analysis.reasoning,
        }
      );
      return false;
    }

    await this.githubClient.replyToComment(ctx, analysis.commentId, replyBody);
    this.logger.info("Posted reply", {
      commentId: analysis.commentId,
      status: analysis.status,
    });

    if (willResolve) {
      if (!threadId) {
        this.logger.warn("Missing review thread id for comment", {
          commentId: analysis.commentId,
        });
        return false;
      }

      await this.githubClient.resolveThread(threadId);
      this.logger.info("Resolved thread", { commentId: analysis.commentId });
    }

    return willResolve;
  }
}
