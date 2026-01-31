import { describe, expect, it } from "vitest";

import { DiffFormatter } from "./diff-formatter";

describe("DiffFormatter", () => {
  it("formats markdown when there are no changed files", () => {
    const formatter = new DiffFormatter();
    const output = formatter.formatMarkdown("feature", "main", [], "");

    expect(output).toContain("# Changes: feature vs main");
    expect(output).toContain("## Changed Files (0)");
    expect(output).toContain("## Full Diff");
    expect(output.split("\n").some((line) => line.startsWith("- "))).toBe(
      false
    );
  });

  it("formats markdown with a single changed file", () => {
    const formatter = new DiffFormatter();
    const diff = "diff --git a/src/index.ts b/src/index.ts\n+console.log('hi')";
    const output = formatter.formatMarkdown(
      "feature",
      "main",
      ["src/index.ts"],
      diff
    );

    expect(output).toContain("## Changed Files (1)");
    expect(output).toContain("- src/index.ts");
    expect(output).toContain("```diff");
    expect(output).toContain(diff);
  });

  it("formats markdown with multiple changed files in order", () => {
    const formatter = new DiffFormatter();
    const output = formatter.formatMarkdown(
      "feature",
      "main",
      ["src/a.ts", "src/b.ts"],
      "diff --git a/src/a.ts b/src/a.ts"
    );

    const firstIndex = output.indexOf("- src/a.ts");
    const secondIndex = output.indexOf("- src/b.ts");

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });
});
