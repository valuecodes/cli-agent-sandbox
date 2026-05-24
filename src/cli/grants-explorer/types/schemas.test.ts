import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { describe, expect, it } from "vitest";

import { CliArgsSchema } from "./schemas";

const silentLogger = new Logger({
  level: "error",
  useColors: false,
  useTimestamps: false,
});

describe("CliArgsSchema (grants-explorer)", () => {
  it("defaults refetch to false when the flag is absent", () => {
    const args = parseArgs({
      logger: silentLogger,
      schema: CliArgsSchema,
      rawArgs: [],
    });
    expect(args.refetch).toBe(false);
    expect(args.file).toBeUndefined();
  });

  it("enables refetch when --refetch is present (no value)", () => {
    const args = parseArgs({
      logger: silentLogger,
      schema: CliArgsSchema,
      rawArgs: ["--refetch"],
    });
    expect(args.refetch).toBe(true);
  });

  it("accepts --file= as a path string", () => {
    const args = parseArgs({
      logger: silentLogger,
      schema: CliArgsSchema,
      rawArgs: ["--file=tmp/other.xlsx"],
    });
    expect(args.file).toBe("tmp/other.xlsx");
    expect(args.refetch).toBe(false);
  });

  // Pins the safer behavior: `--refetch` is presence-only, so any explicit
  // value (`--refetch=false`, `--refetch=true`, `--refetch=foo`) is rejected
  // by the schema rather than silently doing something surprising. The old
  // z.coerce.boolean() form would have made `--refetch=false` truthy and
  // clobbered the cached workbook — see the comment in schemas.ts.
  it("rejects --refetch=<value> (presence-only flag)", () => {
    expect(() =>
      parseArgs({
        logger: silentLogger,
        schema: CliArgsSchema,
        rawArgs: ["--refetch=false"],
      })
    ).toThrow();
    expect(() =>
      parseArgs({
        logger: silentLogger,
        schema: CliArgsSchema,
        rawArgs: ["--refetch=true"],
      })
    ).toThrow();
  });
});
