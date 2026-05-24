import { Logger } from "~clients/logger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GrantRow } from "../types/schemas";
import { GrantsDatabase } from "./database";

const silentLogger = new Logger({
  level: "error",
  useColors: false,
  useTimestamps: false,
});

const row = (overrides: Partial<GrantRow> = {}): GrantRow => ({
  decision_date: "2026-01-15",
  recipient: "Test ry",
  granting_authority: "Lapin ELY-keskus",
  case_number: "001",
  amount_applied: 1000,
  amount_granted: 800,
  has_eu_funding: 0,
  purpose: "Test purpose",
  programme: "Test programme",
  region: "Test region",
  ...overrides,
});

describe("GrantsDatabase", () => {
  let db: GrantsDatabase;

  beforeEach(() => {
    db = new GrantsDatabase(silentLogger);
  });

  afterEach(() => {
    db.close();
  });

  it("inserts rows and counts them", () => {
    db.insertRows([row(), row(), row()]);
    expect(db.getTotalCount()).toBe(3);
  });

  it("SUM(amount_granted) treats null amounts as null (not 0)", () => {
    db.insertRows([
      row({ granting_authority: "Authority A", amount_granted: 100 }),
      row({ granting_authority: "Authority A", amount_granted: 200 }),
      row({ granting_authority: "Authority A", amount_granted: null }),
      row({ granting_authority: "Authority B", amount_granted: 500 }),
    ]);

    // Authority A: SUM ignores the null row → 300, not 0+100+200.
    const a = db.queryOne<{ s: number | null }>(
      "SELECT SUM(amount_granted) as s FROM grants WHERE granting_authority = ?",
      ["Authority A"]
    );
    expect(a?.s).toBe(300);

    // Same authority, COUNT(amount_granted) excludes the null; COUNT(*) includes it.
    const c = db.queryOne<{ total: number; non_null: number }>(
      "SELECT COUNT(*) as total, COUNT(amount_granted) as non_null FROM grants WHERE granting_authority = ?",
      ["Authority A"]
    );
    expect(c?.total).toBe(3);
    expect(c?.non_null).toBe(2);
  });

  it("filters by has_eu_funding correctly", () => {
    db.insertRows([
      row({ has_eu_funding: 1 }),
      row({ has_eu_funding: 0 }),
      row({ has_eu_funding: 0 }),
    ]);
    const result = db.queryOne<{ n: number }>(
      "SELECT COUNT(*) as n FROM grants WHERE has_eu_funding = 1"
    );
    expect(result?.n).toBe(1);
  });

  it("supports LIKE search across recipient (incl. y-tunnus)", () => {
    db.insertRows([
      row({ recipient: "Lapin Martat ry (0210606-0)" }),
      row({ recipient: "Rikala-seura ry (2477520-6)" }),
    ]);
    const result = db.query<{ recipient: string }>(
      "SELECT recipient FROM grants WHERE recipient LIKE ?",
      ["%0210606-0%"]
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.recipient).toBe("Lapin Martat ry (0210606-0)");
  });

  it("CHECK constraint rejects out-of-range has_eu_funding", () => {
    expect(() => {
      db.insertRows([row({ has_eu_funding: 2 as unknown as 0 | 1 })]);
    }).toThrow();
  });
});
