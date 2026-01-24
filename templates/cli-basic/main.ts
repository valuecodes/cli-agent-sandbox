// pnpm run:_CLI_NAME_

// _CLI_DESCRIPTION_

import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { z } from "zod";

const logger = new Logger();

logger.info("_CLI_NAME_ running...");

// --- Parse CLI arguments ---
const { verbose } = parseArgs({
  logger,
  schema: z.object({
    verbose: z.coerce.boolean().default(false),
  }),
});

if (verbose) {
  logger.debug("Verbose mode enabled");
}

// --- Main logic ---
// TODO: Implement your CLI logic here
//
// Common patterns:
// - Create a Pipeline class in ./clients/ for multi-step workflows
// - Use QuestionHandler from ~utils/question-handler for interactive prompts
// - Store output under tmp/_CLI_NAME_/
// - Use Zod schemas in ./types/ for data validation

logger.info("_CLI_NAME_ completed.");
