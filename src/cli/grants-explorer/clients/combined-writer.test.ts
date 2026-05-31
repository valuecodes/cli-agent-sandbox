import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "~clients/logger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { GrantRowSchema } from "../types/schemas";
import type { GrantRow } from "../types/schemas";
import { writeCombinedGrants } from "./combined-writer";

const silentLogger = new Logger({
  level: "error",
  useColors: false,
  useTimestamps: false,
});

const sampleRows: GrantRow[] = [
  {
    decision_date: "2024-01-15",
    recipient: "Foo ry (1234567-8)",
    recipient_business_id: "1234567-8",
    granting_authority: "Lapin ELY-keskus",
    case_number: "L-001",
    amount_applied: 100_000,
    amount_granted: 80_000,
    has_eu_funding: 1,
    purpose: "Test purpose",
    programme: "Test programme (key-1)",
    region: "Lappi",
    sektoriluokitus_code: "S15",
    sektoriluokitus_label:
      "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
  },
  {
    // Every nullable field null — pins that NULLs round-trip as JSON null,
    // not undefined / missing keys.
    decision_date: null,
    recipient: null,
    recipient_business_id: null,
    granting_authority: null,
    case_number: null,
    amount_applied: null,
    amount_granted: null,
    has_eu_funding: 0,
    purpose: null,
    programme: null,
    region: null,
    sektoriluokitus_code: "BLANK",
    sektoriluokitus_label: "(Tyhjä)",
  },
  {
    // Sentinel sector code on the explicit "missing" bucket.
    decision_date: "2025-03-01",
    recipient: "Working group (no business id)",
    recipient_business_id: null,
    granting_authority: "Pohjois-Pohjanmaan ELY-keskus",
    case_number: "P-042",
    amount_applied: 50_000,
    amount_granted: 50_000,
    has_eu_funding: 1,
    purpose: "Another purpose",
    programme: "Another programme",
    region: "Pohjois-Pohjanmaa",
    sektoriluokitus_code: "PUUTTUU",
    sektoriluokitus_label: "Sektoriluokitus puuttuu",
  },
];

describe("writeCombinedGrants", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "combined-writer-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips GrantRow[] through write + parse with schema-valid output", async () => {
    const path = join(dir, "grants.json");
    await writeCombinedGrants({ logger: silentLogger, path, rows: sampleRows });

    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const validated = z.array(GrantRowSchema).parse(parsed);

    expect(validated).toEqual(sampleRows);
    // Nullable fields must survive the round-trip as JSON null (not stripped
    // to undefined / missing keys), or downstream tools relying on positional
    // shape would silently see different columns per row.
    expect(validated[1]?.amount_granted).toBeNull();
    expect(validated[1]?.recipient_business_id).toBeNull();
  });

  it("renames the temp file atomically (no .tmp-* leftovers after success)", async () => {
    const path = join(dir, "grants.json");
    await writeCombinedGrants({ logger: silentLogger, path, rows: sampleRows });

    const entries = await readdir(dir);
    expect(entries).toEqual(["grants.json"]);
    expect(entries.some((f) => f.includes(".tmp-"))).toBe(false);
  });
});
