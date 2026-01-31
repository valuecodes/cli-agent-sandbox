import { describe, expect, it } from "vitest";

import type { Comment, PrContext, ReviewComment } from "../types/schemas";
import { CommentFormatter } from "./comment-formatter";

describe("CommentFormatter", () => {
  const ctx: PrContext = { repo: "owner/repo", pr: 123 };

  const baseComment: Comment = {
    created_at: "2026-01-01T00:00:00Z",
    user: { login: "alice" },
    body: "LGTM",
    html_url: "https://example.com/comment",
  };

  it("renders review comments with line info when available", () => {
    const formatter = new CommentFormatter();
    const reviewComment: ReviewComment = {
      ...baseComment,
      id: 1,
      node_id: "PRRC_1",
      path: "src/index.ts",
      line: 42,
      original_line: null,
      position: null,
    };

    const output = formatter.formatMarkdown(
      ctx,
      [baseComment],
      [reviewComment]
    );

    expect(output).toContain("src/index.ts:42");
  });

  it("renders a placeholder when line info is missing", () => {
    const formatter = new CommentFormatter();
    const reviewComment: ReviewComment = {
      ...baseComment,
      id: 2,
      node_id: "PRRC_2",
      path: "src/index.ts",
      line: null,
      original_line: null,
      position: null,
    };

    const output = formatter.formatMarkdown(
      ctx,
      [baseComment],
      [reviewComment]
    );

    expect(output).toContain("src/index.ts:(no line info)");
  });
});
