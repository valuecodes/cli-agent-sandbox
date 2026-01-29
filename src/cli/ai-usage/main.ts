// pnpm ai:usage
// pnpm ai:usage --since 24h
// pnpm ai:usage --since 30d
// pnpm ai:usage --repo /path/to/repo
// pnpm ai:usage --json
// pnpm ai:usage --debug

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { UsagePipeline } from "./clients/usage-pipeline";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger({ level: "info" });
const args = parseArgs({ logger, schema: CliArgsSchema });

if (args.debug) {
  logger.debug("Debug mode enabled");
  logger.debug("Arguments", args);
}

const pipeline = new UsagePipeline({ logger, debug: args.debug });
const report = await pipeline.getReport({
  since: args.since,
  repoPath: args.repo,
  json: args.json,
});

console.log(report);
