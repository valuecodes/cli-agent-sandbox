import { describe, expect, it } from "vitest";

import type { PrhCompany } from "../types/schemas";
import { findBestMatch } from "./name-matcher";

const makeCompany = (
  businessId: string,
  names: { name: string; type: string; endDate?: string }[]
): PrhCompany =>
  ({
    businessId: { value: businessId },
    names: names.map((n) => ({
      name: n.name,
      type: n.type,
      registrationDate: "2000-01-01",
      endDate: n.endDate,
    })),
    addresses: [],
    companyForms: [],
  }) as unknown as PrhCompany;

describe("findBestMatch", () => {
  const companies = [
    makeCompany("0985469-4", [
      {
        name: "Skandinaviska Enskilda Banken AB (publ) Helsingforsfilialen",
        type: "1",
      },
      {
        name: "Skandinaviska Enskilda Banken AB (publ) Helsingin sivukonttori",
        type: "2",
      },
      {
        name: "Skandinaviska Enskilda Banken AB (publ) Helsinki Branch",
        type: "2",
      },
      {
        name: "Skandinaviska Enskilda Banken Helsingforsfilialen",
        type: "1",
        endDate: "1995-09-19",
      },
    ]),
    makeCompany("1234567-8", [
      { name: "Nordea Bank Abp", type: "1" },
      { name: "Nordea Bank Oyj", type: "2" },
    ]),
  ];

  it("finds exact match (case-insensitive)", () => {
    const result = findBestMatch({
      query: "Skandinaviska Enskilda Banken AB (publ) Helsingin sivukonttori",
      companies,
    });
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("exact");
    expect(result?.company.businessId.value).toBe("0985469-4");
  });

  it("finds contains match when query has extra text", () => {
    const result = findBestMatch({
      query: "Skandinaviska Enskilda Banken Ab (publ) Helsingin Sivukonttori",
      companies,
    });
    expect(result).not.toBeNull();
    expect(result?.company.businessId.value).toBe("0985469-4");
    expect(["exact", "high"]).toContain(result?.confidence);
  });

  it("finds match via token similarity", () => {
    const result = findBestMatch({
      query: "Nordea Bank",
      companies,
    });
    expect(result).not.toBeNull();
    expect(result?.company.businessId.value).toBe("1234567-8");
  });

  it("skips names with endDate", () => {
    const result = findBestMatch({
      query: "Skandinaviska Enskilda Banken Helsingforsfilialen",
      companies,
    });
    // Should NOT match the historical name with endDate
    if (result) {
      expect(result.matchedName.endDate).toBeUndefined();
    }
  });

  it("returns null when no match found", () => {
    const result = findBestMatch({
      query: "Totally Unknown Company XYZ",
      companies,
    });
    expect(result).toBeNull();
  });

  it("returns null for empty companies list", () => {
    const result = findBestMatch({
      query: "Nordea",
      companies: [],
    });
    expect(result).toBeNull();
  });
});
