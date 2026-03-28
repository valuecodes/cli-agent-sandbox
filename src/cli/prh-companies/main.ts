// pnpm run:prh-companies

// Download PRH company registry and extract company names

import path from "node:path";
import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { PrhPipeline } from "./clients/prh-pipeline";
import { OUTPUT_BASE_DIR } from "./constants";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

try {
  logger.info("prh-companies running...");

  const { verbose } = parseArgs({ logger, schema: CliArgsSchema });
  if (verbose) {
    logger.debug("Verbose mode enabled");
  }

  const outputDir = path.join(process.cwd(), OUTPUT_BASE_DIR);
  const pipeline = new PrhPipeline({ logger, outputDir });
  const result = await pipeline.run();

  logger.info("prh-companies completed.", {
    totalCompanies: result.totalCompanies,
    outputPath: result.outputPath,
  });
} catch (error) {
  logger.error("Fatal error", { error });
  process.exit(1);
}
