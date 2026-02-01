import type { ReviewThread } from "~clients/github-client";

export type CommentThreadInfo = {
  threadId: string;
  isResolved: boolean;
};

export const buildCommentThreadIndex = (
  threads: ReviewThread[]
): Map<number, CommentThreadInfo> => {
  const index = new Map<number, CommentThreadInfo>();

  for (const thread of threads) {
    for (const commentId of thread.commentIds) {
      index.set(commentId, {
        threadId: thread.id,
        isResolved: thread.isResolved,
      });
    }
  }

  return index;
};
