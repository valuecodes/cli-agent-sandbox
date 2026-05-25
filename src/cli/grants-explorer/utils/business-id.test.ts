import { describe, expect, it } from "vitest";

import { extractBusinessId } from "./business-id";

describe("extractBusinessId", () => {
  it.each([
    ["Suomen elokuvasäätiö sr (0202113-9)", "0202113-9"],
    ["Lapin Martat ry (0210606-0)", "0210606-0"],
    // Defensive: recipient is normalizeText-trimmed upstream, but the regex
    // tolerates trailing whitespace so this can't silently regress.
    ["Foo ry (0202113-9)  ", "0202113-9"],
    // Multiple parens: only the trailing y-tunnus is extracted, not a
    // mid-string lookalike.
    ["Org with two ids (1234567-8) (0202113-9)", "0202113-9"],
  ])("extracts y-tunnus from %p", (input, expected) => {
    expect(extractBusinessId(input)).toBe(expected);
  });

  it.each([
    ["Bare individual name"],
    [""],
    // Wrong digit counts → not a valid y-tunnus shape.
    ["Wrong format (12345-67)"],
    ["Wrong format (12345678-9)"],
    // Not end-anchored: a mid-string y-tunnus without the trailing form is
    // intentionally NOT extracted.
    ["Mid-string (0202113-9) extra text"],
  ])("returns null for %p", (input) => {
    expect(extractBusinessId(input)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractBusinessId(null)).toBeNull();
  });
});
