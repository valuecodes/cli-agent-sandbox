import { GitHubClient } from "~clients/github-client";
import type { Logger } from "~clients/logger";

import type {
  CommentAnalysis,
  PrContext,
  ReviewComment,
} from "../types/schemas";

type CommentResolverOptions = {
  logger: Logger;
};

type ResolveOptions = {
  analysis: CommentAnalysis;
  comment: ReviewComment;
  ctx: PrContext;
  dryRun: boolean;
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
    comment,
    ctx,
    dryRun,
  }: ResolveOptions): Promise<boolean> {
    if (!analysis.isAddressed) {
      this.logger.debug("Skipping unaddressed comment", {
        commentId: analysis.commentId,
      });
      return false;
    }

    const replyBody = analysis.suggestedReply;

    if (dryRun) {
      this.logger.info("[DRY RUN] Would reply and resolve", {
        commentId: analysis.commentId,
        reply: replyBody,
        reasoning: analysis.reasoning,
      });
      return false;
    }

    await this.githubClient.replyToComment(ctx, analysis.commentId, replyBody);
    this.logger.info("Posted reply", { commentId: analysis.commentId });

    await this.githubClient.resolveThread(comment.node_id);
    this.logger.info("Resolved thread", { commentId: analysis.commentId });

    return true;
  }
}
