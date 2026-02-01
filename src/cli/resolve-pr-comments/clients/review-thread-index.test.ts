import type { ReviewThread } from "~clients/github-client";
import { describe, expect, it } from "vitest";

import { buildCommentThreadIndex } from "./review-thread-index";

describe("buildCommentThreadIndex", () => {
  it("maps every comment id to its thread and resolution state", () => {
    const threads: ReviewThread[] = [
      {
        id: "thread-1",
        isResolved: false,
        commentIds: [101, 102],
        hasMoreComments: false,
      },
      {
        id: "thread-2",
        isResolved: true,
        commentIds: [201],
        hasMoreComments: false,
      },
    ];

    const index = buildCommentThreadIndex(threads);

    expect(index.get(101)).toEqual({ threadId: "thread-1", isResolved: false });
    expect(index.get(102)).toEqual({ threadId: "thread-1", isResolved: false });
    expect(index.get(201)).toEqual({ threadId: "thread-2", isResolved: true });
  });
});
