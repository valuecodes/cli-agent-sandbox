import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrhClient } from "./prh-client";

vi.mock("~tools/utils/url-safety", () => ({
  resolveAndValidateUrl: vi.fn().mockResolvedValue({ valid: true }),
}));

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  tool: vi.fn(),
  answer: vi.fn(),
  question: vi.fn(),
};

const validApiResponse = {
  totalResults: 1,
  companies: [
    {
      businessId: { value: "0985469-4", registrationDate: "1994-11-25" },
      names: [
        {
          name: "Skandinaviska Enskilda Banken AB (publ) Helsingforsfilialen",
          type: "1",
          registrationDate: "1995-09-20",
        },
      ],
      addresses: [],
      companyForms: [],
    },
  ],
};

describe("PrhClient", () => {
  let client: PrhClient;

  beforeEach(() => {
    client = new PrhClient({ logger: mockLogger as never });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validApiResponse),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed API response on success", async () => {
    const result = await client.searchByName("SEB");
    expect(result.totalResults).toBe(1);
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]?.businessId.value).toBe("0985469-4");
  });

  it("URL-encodes the company name", async () => {
    await client.searchByName("Test (publ) Oy");
    const fetchCalls = vi.mocked(fetch).mock.calls;
    expect(fetchCalls[0]?.[0]).toContain("Test%20(publ)%20Oy");
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })
    );
    await expect(client.searchByName("Test")).rejects.toThrow(
      "PRH API error: 500"
    );
  });

  it("throws on invalid API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: true }),
      })
    );
    await expect(client.searchByName("Test")).rejects.toThrow(
      "Invalid PRH API response"
    );
  });

  it("returns empty companies for zero results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalResults: 0, companies: [] }),
      })
    );
    const result = await client.searchByName("Nonexistent");
    expect(result.totalResults).toBe(0);
    expect(result.companies).toHaveLength(0);
  });
});
