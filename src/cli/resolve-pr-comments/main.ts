#!/usr/bin/env tsx

/**
 * Analyze PR diff and resolve addressed review comments.
 *
 * Usage:
 *   pnpm run:resolve-pr-comments -- --pr=10 --base=main
 *   pnpm run:resolve-pr-comments -- --pr=10 --dry-run
 */
import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { ResolvePrPipeline } from "./clients/resolve-pr-pipeline";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

try {
  const args = parseArgs({ logger, schema: CliArgsSchema });

  const pipeline = new ResolvePrPipeline({ logger });
  await pipeline.run({
    pr: args.pr,
    repo: args.repo,
    base: args.base,
    dryRun: args.dryRun,
  });
} catch (err: unknown) {
  logger.error("Failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
