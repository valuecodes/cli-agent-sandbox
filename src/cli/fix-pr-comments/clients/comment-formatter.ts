import type { Comment, PrContext, ReviewComment } from "../types/schemas";

/**
 * Formats PR comments into markdown output.
 */
export class CommentFormatter {
  /**
   * Format a single conversation comment.
   */
  private formatComment(comment: Comment): string {
    return `— ${comment.created_at}  ${comment.user.login}\n  ${comment.body}\n  ${comment.html_url}\n`;
  }

  /**
   * Format a single review comment with file location.
   */
  private formatReviewComment(comment: ReviewComment): string {
    const line = comment.line ?? comment.original_line ?? comment.position;
    const location =
      line != null
        ? `${comment.path}:${line}`
        : `${comment.path}:(no line info)`;
    return `— ${comment.created_at}  ${comment.user.login}\n  ${location}\n  ${comment.body}\n  ${comment.html_url}\n`;
  }

  /**
   * Build the complete markdown document from all comments.
   */
  formatMarkdown(
    ctx: PrContext,
    conversationComments: Comment[],
    reviewComments: ReviewComment[]
  ): string {
    const lines: string[] = [];

    lines.push(`# PR #${ctx.pr} — ${ctx.repo}`);
    lines.push("");
    lines.push("## Conversation comments (top-level)");

    for (const comment of conversationComments) {
      lines.push(this.formatComment(comment));
    }

    lines.push("");
    lines.push("## Inline review comments (diff comments + replies)");

    for (const comment of reviewComments) {
      lines.push(this.formatReviewComment(comment));
    }

    return lines.join("\n");
  }
}
