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
 * Formats aggregated usage data for output.
 * All format methods return strings; printing is the caller's responsibility.
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
   * Format warning about models missing from pricing config.
   */
  formatUnknownModelsWarning(models: string[]): string {
    if (models.length === 0) {
      return "";
    }

    const lines = [
      "\nWarning: The following models have no pricing data:",
      ...models.map((model) => `  - ${model}`),
      "Add pricing info to ai-usage.pricing.json for accurate cost estimates.",
    ];
    return lines.join("\n");
  }

  /**
   * Format the summary section (totals per provider and model).
   */
  formatSummary(usage: AggregatedUsage): string {
    const lines: string[] = [];

    lines.push(`\nAI Usage Summary (Last ${this.sinceLabel})`);

    const warning = this.formatUnknownModelsWarning(usage.unknownModels);
    if (warning) {
      lines.push(warning);
    }
    lines.push("");

    // By provider
    lines.push("By Provider:");
    for (const [provider, summary] of Object.entries(usage.byProvider)) {
      const tokens = this.formatNumber(summary.tokens);
      const cost = this.formatCost(summary.cost);
      lines.push(`  ${provider}: ${tokens} tokens (${cost})`);
    }

    // By model
    lines.push("\nBy Model:");
    for (const summary of usage.byModel) {
      const tokens = this.formatNumber(summary.tokens);
      const cost = this.formatCost(summary.cost);
      lines.push(`  ${summary.model}: ${tokens} tokens (${cost})`);
    }

    lines.push("");
    return lines.join("\n");
  }

  /**
   * Format the markdown table.
   */
  formatTable(usage: AggregatedUsage): string {
    const lines: string[] = [];
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

    lines.push(`| ${header} |`);
    lines.push(`|-${separator}-|`);

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
      lines.push(`| ${line} |`);
    }

    // Separator before totals
    lines.push(`|-${separator}-|`);

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
    lines.push(`| ${totalsLine} |`);

    return lines.join("\n");
  }

  /**
   * Format JSON output.
   */
  formatJson(usage: AggregatedUsage): string {
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
    return JSON.stringify(output, null, 2);
  }

  /**
   * Format empty JSON output when no data is found.
   */
  formatEmptyJson(repo: string, since: Date, until: Date): string {
    return JSON.stringify({
      period: {
        since: since.toISOString(),
        until: until.toISOString(),
      },
      repo,
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
    });
  }

  /**
   * Format a message when no data is found.
   */
  formatNoData(repo: string): string {
    return `\nNo usage data found for repo: ${repo}\nTime period: Last ${this.sinceLabel}\n`;
  }
}
