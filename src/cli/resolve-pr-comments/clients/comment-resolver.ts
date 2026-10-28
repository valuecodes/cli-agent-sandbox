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
};

/**
 * Handles GitHub API operations for replying to and reacting to PR comments.
 * Uses 👍 reaction to mark addressed comments instead of resolving threads.
 */
export class CommentResolver {
  private readonly githubClient: GitHubClient;
  private readonly logger: Logger;

  constructor(options: CommentResolverOptions) {
    this.logger = options.logger;
    this.githubClient = new GitHubClient({ logger: options.logger });
  }

  /**
   * Get comment IDs that have already been marked with 👍 reaction.
   */
  async getAlreadyAddressedIds(
    ctx: PrContext,
    commentIds: number[]
  ): Promise<Set<number>> {
    return this.githubClient.getCommentIdsWithReaction(ctx, commentIds, "+1");
  }

  /**
   * Get comment IDs that were previously marked as uncertain with 👀 reaction.
   */
  async getPreviouslyUncertainIds(
    ctx: PrContext,
    commentIds: number[]
  ): Promise<Set<number>> {
    return this.githubClient.getCommentIdsWithReaction(ctx, commentIds, "eyes");
  }

  async resolveComment({
    analysis,
    ctx,
    dryRun,
  }: ResolveOptions): Promise<boolean> {
    if (analysis.status === "not_addressed") {
      this.logger.debug("Skipping unaddressed comment", {
        commentId: analysis.commentId,
      });
      return false;
    }

    const replyBody = analysis.suggestedReply;
    const isAddressed = analysis.status === "addressed";

    if (dryRun) {
      this.logger.info(
        isAddressed
          ? "[DRY RUN] Would reply and react with 👍"
          : "[DRY RUN] Would reply and react with 👀",
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

    if (isAddressed) {
      await this.githubClient.reactToComment(ctx, analysis.commentId, "+1");
      this.logger.info("Added 👍 reaction", { commentId: analysis.commentId });
    } else {
      // Uncertain - mark with 👀 so we don't re-process unless file changes
      await this.githubClient.reactToComment(ctx, analysis.commentId, "eyes");
      this.logger.info("Added 👀 reaction", { commentId: analysis.commentId });
    }

    return isAddressed;
  }
}
