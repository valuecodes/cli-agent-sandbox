// pnpm ai:usage
// pnpm ai:usage --since 24h
// pnpm ai:usage --since 30d
// pnpm ai:usage --repo /path/to/repo
// pnpm ai:usage --json
// pnpm ai:usage --debug

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { ClaudeLogReader } from "./clients/claude-log-reader";
import { CodexLogReader } from "./clients/codex-log-reader";
import { OutputFormatter } from "./clients/output-formatter";
import { UsageAggregator } from "./clients/usage-aggregator";
import { DURATION_MS } from "./constants";
import type { PricingConfig } from "./types/schemas";
import { CliArgsSchema, PricingConfigSchema } from "./types/schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve repo path, defaulting to git root of current directory.
 */
const resolveRepoPath = (repoArg?: string): string => {
  if (repoArg) {
    return repoArg;
  }

  try {
    const result = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    // Not in a git repo, use cwd
    return process.cwd();
  }
};

/**
 * Parse since duration string to a Date.
 */
const parseSinceDuration = (since: string): Date => {
  const ms = DURATION_MS[since];
  if (!ms) {
    throw new Error(
      `Invalid --since value: ${since}. Use one of: ${Object.keys(DURATION_MS).join(", ")}`
    );
  }
  return new Date(Date.now() - ms);
};

/**
 * Load pricing config from JSON file.
 */
const loadPricing = (): PricingConfig => {
  const pricingPath = join(__dirname, "ai-usage.pricing.json");
  const content = readFileSync(pricingPath, "utf-8");
  const data: unknown = JSON.parse(content);
  return PricingConfigSchema.parse(data);
};

// --- Main ---

const logger = new Logger({ level: "info" });

// Parse CLI arguments
const args = parseArgs({ logger, schema: CliArgsSchema });

if (args.debug) {
  logger.debug("Debug mode enabled");
  logger.debug("Arguments", args);
}

// Resolve repo path
const repoPath = resolveRepoPath(args.repo);

if (args.debug) {
  logger.debug("Repo path", { repoPath });
}

// Calculate since date
const sinceDate = parseSinceDuration(args.since);
const untilDate = new Date();

if (args.debug) {
  logger.debug("Time range", {
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
}

// Load pricing config
const pricing = loadPricing();

// Initialize readers
const claudeReader = new ClaudeLogReader({ logger, debug: args.debug });
const codexReader = new CodexLogReader({ logger, debug: args.debug });

// Read logs from both providers in parallel
const [claudeRecords, codexRecords] = await Promise.all([
  claudeReader.getUsage({ since: sinceDate, repoPath }),
  codexReader.getUsage({ since: sinceDate, repoPath }),
]);

const allRecords = [...claudeRecords, ...codexRecords];

// Initialize formatter
const formatter = new OutputFormatter({ sinceLabel: args.since });

// Handle no data case
if (allRecords.length === 0) {
  if (args.json) {
    console.log(
      JSON.stringify({
        period: {
          since: sinceDate.toISOString(),
          until: untilDate.toISOString(),
        },
        repo: repoPath,
        byProvider: {},
        byModel: [],
        rows: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
          cost: 0,
        },
        unknownModels: [],
      })
    );
  } else {
    formatter.printNoData(repoPath);
  }
  process.exit(0);
}

// Aggregate and calculate costs
const aggregator = new UsageAggregator({ pricing });
const usage = aggregator.aggregate({
  records: allRecords,
  since: sinceDate,
  until: untilDate,
  repo: repoPath,
});

// Output
if (args.json) {
  formatter.printJson(usage);
} else {
  formatter.printSummary(usage);
  formatter.printTable(usage);
}
