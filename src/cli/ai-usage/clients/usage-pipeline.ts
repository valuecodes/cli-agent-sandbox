import { execSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Logger } from "~clients/logger";

import { DURATION_MS } from "../constants";
import type { PricingConfig } from "../types/schemas";
import { PricingConfigSchema } from "../types/schemas";
import { ClaudeLogReader } from "./claude-log-reader";
import { CodexLogReader } from "./codex-log-reader";
import { OutputFormatter } from "./output-formatter";
import { UsageAggregator } from "./usage-aggregator";

const __dirname = dirname(fileURLToPath(import.meta.url));

type UsagePipelineOptions = {
  logger: Logger;
  debug: boolean;
};

type GetReportOptions = {
  since: string;
  repoPath?: string;
  json: boolean;
};

/**
 * Orchestrates usage data collection, aggregation, and formatting.
 */
export class UsagePipeline {
  private logger: Logger;
  private debug: boolean;

  constructor(options: UsagePipelineOptions) {
    this.logger = options.logger;
    this.debug = options.debug;
  }

  /**
   * Execute the pipeline and return a formatted report.
   */
  async getReport(options: GetReportOptions): Promise<string> {
    const repoPath = this.resolveRepoPath(options.repoPath);
    const sinceDate = this.parseSinceDuration(options.since);
    const untilDate = new Date();
    const pricing = this.loadPricing();

    if (this.debug) {
      this.logger.debug("Repo path", { repoPath });
      this.logger.debug("Time range", {
        since: sinceDate.toISOString(),
        until: untilDate.toISOString(),
      });
    }

    // Initialize readers
    const claudeReader = new ClaudeLogReader({
      logger: this.logger,
      debug: this.debug,
    });
    const codexReader = new CodexLogReader({
      logger: this.logger,
      debug: this.debug,
    });

    // Read logs from both providers in parallel
    const [claudeRecords, codexRecords] = await Promise.all([
      claudeReader.getUsage({ since: sinceDate, repoPath }),
      codexReader.getUsage({ since: sinceDate, repoPath }),
    ]);

    const allRecords = [...claudeRecords, ...codexRecords];
    const formatter = new OutputFormatter({ sinceLabel: options.since });

    // Handle no data case
    if (allRecords.length === 0) {
      if (options.json) {
        return formatter.formatEmptyJson(repoPath, sinceDate, untilDate);
      }
      return formatter.formatNoData(repoPath);
    }

    // Aggregate and calculate costs
    const aggregator = new UsageAggregator({ pricing });
    const usage = aggregator.aggregate({
      records: allRecords,
      since: sinceDate,
      until: untilDate,
      repo: repoPath,
    });

    // Format output
    if (options.json) {
      return formatter.formatJson(usage);
    }
    return formatter.formatSummary(usage) + formatter.formatTable(usage);
  }

  /**
   * Resolve repo path, defaulting to git root of current directory.
   */
  private resolveRepoPath(repoArg?: string): string {
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
  }

  /**
   * Parse since duration string to a Date.
   */
  private parseSinceDuration(since: string): Date {
    const ms = DURATION_MS[since];
    if (!ms) {
      throw new Error(
        `Invalid --since value: ${since}. Use one of: ${Object.keys(DURATION_MS).join(", ")}`
      );
    }
    return new Date(Date.now() - ms);
  }

  /**
   * Load pricing config from JSON file.
   */
  private loadPricing(): PricingConfig {
    const pricingPath = join(__dirname, "..", "ai-usage.pricing.json");
    const content = readFileSync(pricingPath, "utf-8");
    const data: unknown = JSON.parse(content);
    return PricingConfigSchema.parse(data);
  }
}
