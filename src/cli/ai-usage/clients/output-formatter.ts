import type { AggregatedUsage } from "../types/schemas";

type OutputFormatterOptions = {
  sinceLabel: string;
};

/**
 * Formats aggregated usage data for console output.
 */
export class OutputFormatter {
  private sinceLabel: string;

  constructor(options: OutputFormatterOptions) {
    this.sinceLabel = options.sinceLabel;
  }

  /**
   * Format a number with thousand separators.
   */
  private formatNumber(n: number): string {
    return n.toLocaleString("en-US");
  }

  /**
   * Format a cost in USD.
   */
  private formatCost(cost: number): string {
    return `$${cost.toFixed(2)}`;
  }

  /**
   * Pad a string to a given width (right-aligned for numbers).
   */
  private padRight(s: string, width: number): string {
    return s.padEnd(width);
  }

  private padLeft(s: string, width: number): string {
    return s.padStart(width);
  }

  /**
   * Print warning about models missing from pricing config.
   */
  printUnknownModelsWarning(models: string[]): void {
    if (models.length === 0) {
      return;
    }

    console.log("\nWarning: The following models have no pricing data:");
    for (const model of models) {
      console.log(`  - ${model}`);
    }
    console.log("Add pricing info to ai-usage.pricing.json for accurate cost estimates.");
  }

  /**
   * Print the summary section (totals per provider and model).
   */
  printSummary(usage: AggregatedUsage): void {
    console.log(`\nAI Usage Summary (Last ${this.sinceLabel})`);
    console.log(`Repo: ${usage.repo}`);
    this.printUnknownModelsWarning(usage.unknownModels);
    console.log("");

    // By provider
    console.log("By Provider:");
    for (const [provider, summary] of Object.entries(usage.byProvider)) {
      const tokens = this.formatNumber(summary.tokens);
      const cost = this.formatCost(summary.cost);
      console.log(`  ${provider}: ${tokens} tokens (${cost})`);
    }

    // By model
    console.log("\nBy Model:");
    for (const summary of usage.byModel) {
      const tokens = this.formatNumber(summary.tokens);
      const cost = this.formatCost(summary.cost);
      console.log(`  ${summary.model}: ${tokens} tokens (${cost})`);
    }

    console.log("");
  }

  /**
   * Print the markdown table.
   */
  printTable(usage: AggregatedUsage): void {
    // Column widths
    const cols = {
      provider: 8,
      model: 28,
      input: 12,
      output: 12,
      cacheR: 12,
      cacheW: 12,
      total: 12,
      cost: 12,
    };

    // Header
    const header = [
      this.padRight("Provider", cols.provider),
      this.padRight("Model", cols.model),
      this.padLeft("Input", cols.input),
      this.padLeft("Output", cols.output),
      this.padLeft("Cache R", cols.cacheR),
      this.padLeft("Cache W", cols.cacheW),
      this.padLeft("Total", cols.total),
      this.padLeft("Est. Cost", cols.cost),
    ].join(" | ");

    const separator = [
      "-".repeat(cols.provider),
      "-".repeat(cols.model),
      "-".repeat(cols.input),
      "-".repeat(cols.output),
      "-".repeat(cols.cacheR),
      "-".repeat(cols.cacheW),
      "-".repeat(cols.total),
      "-".repeat(cols.cost),
    ].join("-|-");

    console.log(`| ${header} |`);
    console.log(`|-${separator}-|`);

    // Rows
    for (const row of usage.rows) {
      const line = [
        this.padRight(row.provider, cols.provider),
        this.padRight(row.model, cols.model),
        this.padLeft(this.formatNumber(row.inputTokens), cols.input),
        this.padLeft(this.formatNumber(row.outputTokens), cols.output),
        this.padLeft(this.formatNumber(row.cacheReadTokens), cols.cacheR),
        this.padLeft(this.formatNumber(row.cacheWriteTokens), cols.cacheW),
        this.padLeft(this.formatNumber(row.totalTokens), cols.total),
        this.padLeft(this.formatCost(row.cost), cols.cost),
      ].join(" | ");
      console.log(`| ${line} |`);
    }

    // Separator before totals
    console.log(`|-${separator}-|`);

    // Totals row
    const totalsLine = [
      this.padRight("TOTAL", cols.provider),
      this.padRight("", cols.model),
      this.padLeft(this.formatNumber(usage.totals.inputTokens), cols.input),
      this.padLeft(this.formatNumber(usage.totals.outputTokens), cols.output),
      this.padLeft(this.formatNumber(usage.totals.cacheReadTokens), cols.cacheR),
      this.padLeft(
        this.formatNumber(usage.totals.cacheWriteTokens),
        cols.cacheW
      ),
      this.padLeft(this.formatNumber(usage.totals.totalTokens), cols.total),
      this.padLeft(this.formatCost(usage.totals.cost), cols.cost),
    ].join(" | ");
    console.log(`| ${totalsLine} |`);
  }

  /**
   * Print JSON output.
   */
  printJson(usage: AggregatedUsage): void {
    const output = {
      period: {
        since: usage.period.since.toISOString(),
        until: usage.period.until.toISOString(),
      },
      repo: usage.repo,
      byProvider: usage.byProvider,
      byModel: usage.byModel,
      rows: usage.rows,
      totals: usage.totals,
      unknownModels: usage.unknownModels,
    };
    console.log(JSON.stringify(output, null, 2));
  }

  /**
   * Print a message when no data is found.
   */
  printNoData(repo: string): void {
    console.log(`\nNo usage data found for repo: ${repo}`);
    console.log(`Time period: Last ${this.sinceLabel}\n`);
  }
}
