// pnpm run:__CLI_NAME__

// __CLI_DESCRIPTION__

import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { z } from "zod";

const logger = new Logger();

logger.info("__CLI_NAME__ running...");

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
// - Store output under tmp/__CLI_NAME__/
// - Use Zod schemas in ./types/ for data validation

logger.info("__CLI_NAME__ completed.");
