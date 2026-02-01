import { describe, expect, it } from "vitest";

import { truncateDiff } from "./comment-analyzer";

describe("truncateDiff", () => {
  it("returns original diff when within limit", () => {
    const result = truncateDiff("abc", 10);

    expect(result.diff).toBe("abc");
    expect(result.truncated).toBe(false);
    expect(result.originalLength).toBe(3);
  });

  it("truncates and annotates diff when over limit", () => {
    const result = truncateDiff("abcdef", 3);

    expect(result.diff).toContain("abc");
    expect(result.diff).toContain("diff truncated to 3 characters");
    expect(result.truncated).toBe(true);
    expect(result.originalLength).toBe(6);
  });
});
