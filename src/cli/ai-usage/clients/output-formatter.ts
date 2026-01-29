import type { AggregatedUsage } from "../types/schemas";

type OutputFormatterOptions = {
  sinceLabel: string;
};

type ColumnWidths = {
  provider: number;
  model: number;
  input: number;
  output: number;
  cacheR: number;
  cacheW: number;
  total: number;
  cost: number;
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
   * Calculate column widths based on actual data values.
   */
  private calculateColumnWidths(usage: AggregatedUsage): ColumnWidths {
    const widths = {
      provider: "Provider".length,
      model: "Model".length,
      input: "Input".length,
      output: "Output".length,
      cacheR: "Cache R".length,
      cacheW: "Cache W".length,
      total: "Total".length,
      cost: "Est. Cost".length,
    };

    for (const row of usage.rows) {
      widths.provider = Math.max(widths.provider, row.provider.length);
      widths.model = Math.max(widths.model, row.model.length);
      widths.input = Math.max(
        widths.input,
        this.formatNumber(row.inputTokens).length
      );
      widths.output = Math.max(
        widths.output,
        this.formatNumber(row.outputTokens).length
      );
      widths.cacheR = Math.max(
        widths.cacheR,
        this.formatNumber(row.cacheReadTokens).length
      );
      widths.cacheW = Math.max(
        widths.cacheW,
        this.formatNumber(row.cacheWriteTokens).length
      );
      widths.total = Math.max(
        widths.total,
        this.formatNumber(row.totalTokens).length
      );
      widths.cost = Math.max(widths.cost, this.formatCost(row.cost).length);
    }

    widths.provider = Math.max(widths.provider, "TOTAL".length);
    widths.input = Math.max(
      widths.input,
      this.formatNumber(usage.totals.inputTokens).length
    );
    widths.output = Math.max(
      widths.output,
      this.formatNumber(usage.totals.outputTokens).length
    );
    widths.cacheR = Math.max(
      widths.cacheR,
      this.formatNumber(usage.totals.cacheReadTokens).length
    );
    widths.cacheW = Math.max(
      widths.cacheW,
      this.formatNumber(usage.totals.cacheWriteTokens).length
    );
    widths.total = Math.max(
      widths.total,
      this.formatNumber(usage.totals.totalTokens).length
    );
    widths.cost = Math.max(
      widths.cost,
      this.formatCost(usage.totals.cost).length
    );

    return widths;
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
    console.log(
      "Add pricing info to ai-usage.pricing.json for accurate cost estimates."
    );
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
    const cols = this.calculateColumnWidths(usage);

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
      this.padLeft(
        this.formatNumber(usage.totals.cacheReadTokens),
        cols.cacheR
      ),
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
