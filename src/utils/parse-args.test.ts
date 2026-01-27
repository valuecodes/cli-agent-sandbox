import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { describe, expect, it } from "vitest";

import { CliArgsSchema } from "../cli/agent-evals/schemas";

describe("parseArgs", () => {
  const logger = new Logger({
    level: "error",
    useColors: false,
    useTimestamps: false,
  });

  it("parses args after a standalone double-dash separator", () => {
    const args = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--", "--suite=example"],
    });

    expect(args.suite).toBe("example");
    expect(args.all).toBe(false);
    expect(args.report).toBe("json");
    expect(args.out).toBe("agent-evals");
    expect(args.verbose).toBe(false);
  });

  it("parses --all even when preceded by a double-dash separator", () => {
    const args = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--", "--all"],
    });

    expect(args.suite).toBeUndefined();
    expect(args.all).toBe(true);
    expect(args.report).toBe("json");
    expect(args.out).toBe("agent-evals");
    expect(args.verbose).toBe(false);
  });

  it("parses --report with valid enum values", () => {
    const argsJson = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--all", "--report=json"],
    });
    expect(argsJson.report).toBe("json");

    const argsMd = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--all", "--report=md"],
    });
    expect(argsMd.report).toBe("md");

    const argsBoth = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--all", "--report=both"],
    });
    expect(argsBoth.report).toBe("both");
  });

  it("parses --out with custom path", () => {
    const args = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--all", "--out=custom/output/path"],
    });

    expect(args.out).toBe("custom/output/path");
  });

  it("parses --verbose flag", () => {
    const args = parseArgs({
      logger,
      schema: CliArgsSchema,
      rawArgs: ["--all", "--verbose"],
    });

    expect(args.verbose).toBe(true);
  });

  it("throws on invalid --report value", () => {
    expect(() =>
      parseArgs({
        logger,
        schema: CliArgsSchema,
        rawArgs: ["--all", "--report=invalid"],
      })
    ).toThrow();
  });

  it("throws when neither --suite nor --all is provided", () => {
    expect(() =>
      parseArgs({
        logger,
        schema: CliArgsSchema,
        rawArgs: [],
      })
    ).toThrow("Either --suite <name> or --all is required");
  });
});
