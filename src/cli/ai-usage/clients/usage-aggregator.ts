import type {
  AggregatedRow,
  AggregatedUsage,
  ModelSummary,
  PricingConfig,
  ProviderSummary,
  UsageRecord,
} from "../types/schemas";

type UsageAggregatorOptions = {
  pricing: PricingConfig;
};

type AggregateOptions = {
  records: UsageRecord[];
  since: Date;
  until: Date;
  repo: string;
};

export class UsageAggregator {
  private pricing: PricingConfig;
  private unknownModels = new Set<string>();

  constructor(options: UsageAggregatorOptions) {
    this.pricing = options.pricing;
  }

  /**
   * Calculate cost for a usage record based on pricing config.
   * Tracks models that have no pricing data configured.
   */
  calculateCost(record: UsageRecord): number {
    const modelPricing = this.pricing.models[record.model];

    if (!modelPricing) {
      this.unknownModels.add(record.model);
      return 0;
    }

    // Prices are per 1M tokens
    const inputCost = (record.inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (record.outputTokens / 1_000_000) * modelPricing.output;
    const cacheReadCost =
      (record.cacheReadTokens / 1_000_000) * (modelPricing.cacheRead ?? 0);
    const cacheWriteCost =
      (record.cacheWriteTokens / 1_000_000) * (modelPricing.cacheWrite ?? 0);

    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }

  /**
   * Aggregate usage records by provider and model.
   */
  aggregate(options: AggregateOptions): AggregatedUsage {
    const { records, since, until, repo } = options;

    // Group by provider+model
    const groups = new Map<
      string,
      {
        provider: "claude" | "codex";
        model: string;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        cost: number;
      }
    >();

    for (const record of records) {
      const key = `${record.provider}:${record.model}`;
      const existing = groups.get(key);
      const cost = this.calculateCost(record);

      if (existing) {
        existing.inputTokens += record.inputTokens;
        existing.outputTokens += record.outputTokens;
        existing.cacheReadTokens += record.cacheReadTokens;
        existing.cacheWriteTokens += record.cacheWriteTokens;
        existing.cost += cost;
      } else {
        groups.set(key, {
          provider: record.provider,
          model: record.model,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          cacheReadTokens: record.cacheReadTokens,
          cacheWriteTokens: record.cacheWriteTokens,
          cost,
        });
      }
    }

    // Build rows
    const rows: AggregatedRow[] = Array.from(groups.values()).map((g) => ({
      provider: g.provider,
      model: g.model,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      cacheReadTokens: g.cacheReadTokens,
      cacheWriteTokens: g.cacheWriteTokens,
      totalTokens: g.inputTokens + g.outputTokens,
      cost: g.cost,
    }));

    // Sort by provider, then by total tokens descending
    rows.sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return b.totalTokens - a.totalTokens;
    });

    // Aggregate by provider
    const byProvider: Record<string, ProviderSummary> = {};
    for (const row of rows) {
      const existing = byProvider[row.provider];
      if (existing) {
        existing.tokens += row.totalTokens;
        existing.cost += row.cost;
      } else {
        byProvider[row.provider] = {
          tokens: row.totalTokens,
          cost: row.cost,
        };
      }
    }

    // Aggregate by model
    const modelMap = new Map<string, { tokens: number; cost: number }>();
    for (const row of rows) {
      const existing = modelMap.get(row.model);
      if (existing) {
        existing.tokens += row.totalTokens;
        existing.cost += row.cost;
      } else {
        modelMap.set(row.model, {
          tokens: row.totalTokens,
          cost: row.cost,
        });
      }
    }

    const byModel: ModelSummary[] = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        tokens: data.tokens,
        cost: data.cost,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    // Calculate totals
    const totals = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      cost: 0,
    };

    for (const row of rows) {
      totals.inputTokens += row.inputTokens;
      totals.outputTokens += row.outputTokens;
      totals.cacheReadTokens += row.cacheReadTokens;
      totals.cacheWriteTokens += row.cacheWriteTokens;
      totals.totalTokens += row.totalTokens;
      totals.cost += row.cost;
    }

    return {
      period: { since, until },
      repo,
      byProvider,
      byModel,
      rows,
      totals,
      unknownModels: Array.from(this.unknownModels).sort(),
    };
  }
}
