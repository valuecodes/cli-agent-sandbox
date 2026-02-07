// pnpm run:agent-evals

// Run automated evaluation cases for AI agents with PASS/FAIL results and reports

import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { EvalPipeline } from "./clients/eval-pipeline";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

try {
  const args = parseArgs({ logger, schema: CliArgsSchema });
  const pipeline = new EvalPipeline({ logger, verbose: args.verbose });

  await pipeline.run({
    suite: args.suite,
    all: args.all,
    compare: args.compare,
    report: args.report,
    out: args.out,
  });
} catch (error) {
  logger.error("Fatal error", { error });
  process.exit(1);
}
