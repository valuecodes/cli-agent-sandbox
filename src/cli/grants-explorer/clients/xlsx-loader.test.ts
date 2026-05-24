import { describe, expect, it } from "vitest";
import XLSX from "xlsx";

import {
  normalizeAmount,
  normalizeEuFunding,
  normalizeExcelDate,
  normalizeText,
} from "./xlsx-loader";

type ParsedDateCode = { y: number; m: number; d: number };
const ssf = XLSX.SSF as {
  parse_date_code: (n: number) => ParsedDateCode | undefined;
};

describe("normalizeExcelDate", () => {
  it("converts numeric Excel serials via XLSX.SSF.parse_date_code", () => {
    // Compute the expected ISO date from the library itself, so a wrong
    // hard-coded constant in this test can't mask a real bug in the helper.
    const serial = 46022;
    const parsed = ssf.parse_date_code(serial);
    if (!parsed) {
      throw new Error("XLSX.SSF.parse_date_code returned undefined");
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(normalizeExcelDate(serial)).toBe(
      `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`
    );
  });

  it("converts JS Date objects to YYYY-MM-DD", () => {
    expect(normalizeExcelDate(new Date("2026-01-15T12:34:56.000Z"))).toBe(
      "2026-01-15"
    );
  });

  it("returns trimmed pre-formatted strings unchanged", () => {
    expect(normalizeExcelDate("2026-01-15")).toBe("2026-01-15");
    expect(normalizeExcelDate("  2026-01-15  ")).toBe("2026-01-15");
  });

  it("returns null for null, undefined, empty/whitespace, NaN, invalid Date", () => {
    expect(normalizeExcelDate(null)).toBeNull();
    expect(normalizeExcelDate(undefined)).toBeNull();
    expect(normalizeExcelDate("")).toBeNull();
    expect(normalizeExcelDate("   ")).toBeNull();
    expect(normalizeExcelDate(Number.NaN)).toBeNull();
    expect(normalizeExcelDate(new Date("not-a-date"))).toBeNull();
  });
});

describe("normalizeAmount", () => {
  it("passes through finite numbers (rounded to integer)", () => {
    expect(normalizeAmount(49855)).toBe(49855);
    expect(normalizeAmount(0)).toBe(0);
    expect(normalizeAmount(49855.4)).toBe(49855);
    expect(normalizeAmount(49855.6)).toBe(49856);
  });

  it("parses numeric strings", () => {
    expect(normalizeAmount("49855")).toBe(49855);
    expect(normalizeAmount("  49855  ")).toBe(49855);
  });

  it("returns null for null/undefined/empty/NaN/non-numeric (NOT 0, NOT skip)", () => {
    expect(normalizeAmount(null)).toBeNull();
    expect(normalizeAmount(undefined)).toBeNull();
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount("   ")).toBeNull();
    expect(normalizeAmount(Number.NaN)).toBeNull();
    expect(normalizeAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeAmount("abc")).toBeNull();
    expect(normalizeAmount({})).toBeNull();
  });
});

describe("normalizeEuFunding", () => {
  it("returns 1 for any non-empty trimmed string", () => {
    expect(
      normalizeEuFunding(
        "https://upload.wikimedia.org/wikipedia/commons/b/b7/Flag_of_Europe.svg"
      )
    ).toBe(1);
    expect(normalizeEuFunding("x")).toBe(1);
  });

  it("returns 0 for null/undefined/empty/whitespace", () => {
    expect(normalizeEuFunding(null)).toBe(0);
    expect(normalizeEuFunding(undefined)).toBe(0);
    expect(normalizeEuFunding("")).toBe(0);
    expect(normalizeEuFunding("   ")).toBe(0);
  });
});

describe("normalizeText", () => {
  it("trims and preserves non-empty strings", () => {
    expect(normalizeText("Lapin Martat ry")).toBe("Lapin Martat ry");
    expect(normalizeText("  Salo  ")).toBe("Salo");
  });

  it("returns null for null/undefined/empty/whitespace", () => {
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
    expect(normalizeText("")).toBeNull();
    expect(normalizeText("   ")).toBeNull();
  });
});
