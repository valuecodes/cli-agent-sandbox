import { z } from "zod";

// CLI arguments schema
const CliArgsSchema = z.object({
  since: z.string().default("7d"),
  repo: z.string().optional(),
  json: z.coerce.boolean().default(false),
  debug: z.coerce.boolean().default(false),
});

// Pricing config schema
const ModelPricingSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
});

const PricingConfigSchema = z.object({
  unit: z.literal("per_1m_tokens"),
  models: z.record(z.string(), ModelPricingSchema),
});

type PricingConfig = z.infer<typeof PricingConfigSchema>;

// Normalized usage record (shared between providers)
const UsageRecordSchema = z.object({
  provider: z.enum(["claude", "codex"]),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  timestamp: z.date(),
});

type UsageRecord = z.infer<typeof UsageRecordSchema>;

// Claude Code CLI log entry schemas
const ClaudeUsageSchema = z.object({
  input_tokens: z.number().optional().default(0),
  output_tokens: z.number().optional().default(0),
  cache_creation_input_tokens: z.number().optional().default(0),
  cache_read_input_tokens: z.number().optional().default(0),
});

const ClaudeMessageSchema = z.object({
  model: z.string().optional(),
  usage: ClaudeUsageSchema.optional(),
});

const ClaudeLogEntrySchema = z.object({
  type: z.string(),
  timestamp: z.string(),
  cwd: z.string().optional(),
  message: ClaudeMessageSchema.optional(),
});

type ClaudeLogEntry = z.infer<typeof ClaudeLogEntrySchema>;

// Codex CLI log entry schemas
const CodexTokenUsageSchema = z.object({
  input_tokens: z.number().optional().default(0),
  cached_input_tokens: z.number().optional().default(0),
  output_tokens: z.number().optional().default(0),
});

const CodexSessionMetaPayloadSchema = z.object({
  cwd: z.string().optional(),
  git: z
    .object({
      repository_url: z.string().optional(),
    })
    .optional(),
});

const CodexTurnContextPayloadSchema = z.object({
  model: z.string().optional(),
});

const CodexEventMsgPayloadSchema = z.object({
  type: z.string(),
  info: z
    .object({
      total_token_usage: CodexTokenUsageSchema.optional(),
      last_token_usage: CodexTokenUsageSchema.optional(),
    })
    .optional(),
});

const CodexLogEntrySchema = z.object({
  type: z.string(),
  timestamp: z.string(),
  payload: z.unknown(),
});

// Aggregated usage types
type AggregatedRow = {
  provider: "claude" | "codex";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
};

type ProviderSummary = {
  tokens: number;
  cost: number;
};

type ModelSummary = {
  model: string;
  tokens: number;
  cost: number;
};

type AggregatedUsage = {
  period: {
    since: Date;
    until: Date;
  };
  repo: string;
  byProvider: Record<string, ProviderSummary>;
  byModel: ModelSummary[];
  rows: AggregatedRow[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    cost: number;
  };
  unknownModels: string[];
};

export type {
  AggregatedRow,
  AggregatedUsage,
  ClaudeLogEntry,
  ModelSummary,
  PricingConfig,
  ProviderSummary,
  UsageRecord,
};
export {
  ClaudeLogEntrySchema,
  ClaudeMessageSchema,
  ClaudeUsageSchema,
  CliArgsSchema,
  CodexEventMsgPayloadSchema,
  CodexLogEntrySchema,
  CodexSessionMetaPayloadSchema,
  CodexTokenUsageSchema,
  CodexTurnContextPayloadSchema,
  ModelPricingSchema,
  PricingConfigSchema,
  UsageRecordSchema,
};
