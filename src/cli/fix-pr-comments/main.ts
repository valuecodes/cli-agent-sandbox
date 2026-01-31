#!/usr/bin/env tsx

/**
 * Fetch all PR comments and optionally launch codex to fix issues.
 *
 * Usage:
 *   pnpm run:fix-pr-comments                  # Auto-detect PR from current branch
 *   pnpm run:fix-pr-comments -- --pr=10       # Explicit PR number
 *   pnpm run:fix-pr-comments -- --no-codex    # Skip launching codex
 */
import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { FixPrPipeline } from "./clients/fix-pr-pipeline";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

const main = async (): Promise<void> => {
  const args = parseArgs({ logger, schema: CliArgsSchema });

  const pipeline = new FixPrPipeline({ logger });
  await pipeline.run({
    pr: args.pr,
    repo: args.repo,
    codex: args.codex,
  });
};

main().catch((err: unknown) => {
  logger.error("Failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
