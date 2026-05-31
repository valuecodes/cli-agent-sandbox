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
  recipient_business_id: null,
  granting_authority: "Lapin ELY-keskus",
  case_number: "001",
  amount_applied: 1000,
  amount_granted: 800,
  has_eu_funding: 0,
  purpose: "Test purpose",
  programme: "Test programme",
  region: "Test region",
  sektoriluokitus_code: "S15",
  sektoriluokitus_label:
    "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
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

  it("equality query on recipient_business_id returns the matching row", () => {
    db.insertRows([
      row({
        recipient: "Lapin Martat ry (0210606-0)",
        recipient_business_id: "0210606-0",
      }),
      row({
        recipient: "Rikala-seura ry (2477520-6)",
        recipient_business_id: "2477520-6",
      }),
    ]);
    const result = db.query<{ recipient: string }>(
      "SELECT recipient FROM grants WHERE recipient_business_id = ?",
      ["0210606-0"]
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.recipient).toBe("Lapin Martat ry (0210606-0)");
  });

  it("recipient_business_id is genuinely nullable (round-trips NULL)", () => {
    db.insertRows([
      row({
        recipient: "Anonymous private grantee",
        recipient_business_id: null,
      }),
      row({
        recipient: "Lapin Martat ry (0210606-0)",
        recipient_business_id: "0210606-0",
      }),
    ]);
    const result = db.query<{ recipient: string }>(
      "SELECT recipient FROM grants WHERE recipient_business_id IS NULL"
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.recipient).toBe("Anonymous private grantee");
  });

  it("CHECK constraint rejects out-of-range has_eu_funding", () => {
    expect(() => {
      db.insertRows([row({ has_eu_funding: 2 as unknown as 0 | 1 })]);
    }).toThrow();
  });

  it("filters by sektoriluokitus_code via indexed equality", () => {
    db.insertRows([
      row({ sektoriluokitus_code: "S15", sektoriluokitus_label: "NPISH" }),
      row({ sektoriluokitus_code: "S11", sektoriluokitus_label: "Yritykset" }),
      row({ sektoriluokitus_code: "S11", sektoriluokitus_label: "Yritykset" }),
    ]);
    const result = db.queryOne<{ n: number }>(
      "SELECT COUNT(*) as n FROM grants WHERE sektoriluokitus_code = ?",
      ["S11"]
    );
    expect(result?.n).toBe(2);
  });

  it("rejects rows with NULL sektoriluokitus_code (schema NOT NULL)", () => {
    expect(() => {
      db.insertRows([row({ sektoriluokitus_code: null as unknown as string })]);
    }).toThrow();
  });
});
