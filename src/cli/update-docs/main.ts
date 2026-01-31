// pnpm run:update-docs

// Update documentation based on branch changes

import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { UpdateDocsPipeline } from "./clients/update-docs-pipeline";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

const args = parseArgs({
  logger,
  schema: CliArgsSchema,
});

const pipeline = new UpdateDocsPipeline({ logger });

try {
  const result = await pipeline.run(args);
  if (result.changedFiles.length === 0) {
    logger.info("No documentation updates needed");
  } else {
    logger.info("Documentation update complete", {
      changedFiles: result.changedFiles.length,
      codexLaunched: result.codexLaunched,
    });
  }
} catch (error: unknown) {
  logger.error("Failed to update docs", { error });
  process.exit(1);
}
