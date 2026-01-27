import { describe, expect, it } from "vitest";
import { z } from "zod";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

const TestSchema = z
  .object({
    suite: z.string().optional(),
    all: z.coerce.boolean().default(false),
  })
  .refine((data) => data.suite ?? data.all, {
    message: "Either --suite <name> or --all is required",
  });

describe("parseArgs", () => {
  const logger = new Logger({
    level: "error",
    useColors: false,
    useTimestamps: false,
  });

  it("parses args after a standalone double-dash separator", () => {
    const args = parseArgs({
      logger,
      schema: TestSchema,
      rawArgs: ["--", "--suite=example"],
    });

    expect(args.suite).toBe("example");
    expect(args.all).toBe(false);
  });

  it("parses --all even when preceded by a double-dash separator", () => {
    const args = parseArgs({
      logger,
      schema: TestSchema,
      rawArgs: ["--", "--all"],
    });

    expect(args.suite).toBeUndefined();
    expect(args.all).toBe(true);
  });
});
