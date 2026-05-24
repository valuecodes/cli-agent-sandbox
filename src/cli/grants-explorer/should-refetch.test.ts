import { describe, expect, it } from "vitest";

import { shouldRefetch } from "./should-refetch";

describe("shouldRefetch", () => {
  it("does not refetch when file exists and refetch flag is off", () => {
    expect(shouldRefetch({ refetch: false, exists: true })).toBe(false);
  });

  it("auto-downloads when the local file is missing", () => {
    expect(shouldRefetch({ refetch: false, exists: false })).toBe(true);
  });

  it("forces refresh when --refetch is passed", () => {
    expect(shouldRefetch({ refetch: true, exists: true })).toBe(true);
  });

  it("downloads when --refetch is passed and file is missing", () => {
    expect(shouldRefetch({ refetch: true, exists: false })).toBe(true);
  });
});
