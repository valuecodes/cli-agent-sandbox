import { z } from "zod";

import {
  DEFAULT_OUT_PATH,
  DEFAULT_REPORT_FORMAT,
  DEFAULT_VERBOSE,
  MIN_COMPARE_MODELS,
} from "../constants";

// ============================================
// Supported Models
// ============================================

export const SupportedModelSchema = z.enum([
  "gpt-5-mini",
  "gpt-4.1-nano",
  "gpt-4.1-mini",
]);
export type SupportedModel = z.infer<typeof SupportedModelSchema>;

// ============================================
// CLI Arguments
// ============================================

export const CliArgsSchema = z
  .object({
    suite: z.string().optional(),
    all: z.coerce.boolean().default(false),
    report: z.enum(["json", "md", "both"]).default(DEFAULT_REPORT_FORMAT),
    out: z.string().default(DEFAULT_OUT_PATH),
    verbose: z.coerce.boolean().default(DEFAULT_VERBOSE),
    compare: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val.split(",").map((m) => SupportedModelSchema.parse(m.trim()))
          : undefined
      ),
  })
  .refine((data) => data.suite ?? data.all, {
    message: "Either --suite <name> or --all is required",
  })
  .refine(
    (data) => !data.compare || data.compare.length >= MIN_COMPARE_MODELS,
    {
      message: `--compare requires at least ${MIN_COMPARE_MODELS} models`,
    }
  );

export type CliArgs = z.infer<typeof CliArgsSchema>;

// ============================================
// Assertion Types
// ============================================

export const ContainsAssertionSchema = z.object({
  type: z.literal("contains"),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
  description: z.string().optional(),
});

export const MatchesRegexAssertionSchema = z.object({
  type: z.literal("matchesRegex"),
  pattern: z.string(),
  flags: z.string().optional(),
  description: z.string().optional(),
});

export const EqualsAssertionSchema = z.object({
  type: z.literal("equals"),
  expected: z.unknown(),
  description: z.string().optional(),
});

export const JsonPathAssertionSchema = z.object({
  type: z.literal("jsonPath"),
  path: z.string(),
  expected: z.unknown(),
  description: z.string().optional(),
});

// ============================================
// File Assertion Types (for verifying tool side effects)
// ============================================

export const FileExistsAssertionSchema = z.object({
  type: z.literal("fileExists"),
  path: z.string(),
  description: z.string().optional(),
});

export const FileContainsAssertionSchema = z.object({
  type: z.literal("fileContains"),
  path: z.string(),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
  description: z.string().optional(),
});

export const FileJsonPathAssertionSchema = z.object({
  type: z.literal("fileJsonPath"),
  path: z.string(),
  jsonPath: z.string(),
  expected: z.unknown(),
  description: z.string().optional(),
});

export const FileNotExistsAssertionSchema = z.object({
  type: z.literal("fileNotExists"),
  path: z.string(),
  description: z.string().optional(),
});

export const AssertionSchema = z.discriminatedUnion("type", [
  ContainsAssertionSchema,
  MatchesRegexAssertionSchema,
  EqualsAssertionSchema,
  JsonPathAssertionSchema,
  FileExistsAssertionSchema,
  FileContainsAssertionSchema,
  FileJsonPathAssertionSchema,
  FileNotExistsAssertionSchema,
]);

export type Assertion = z.infer<typeof AssertionSchema>;
export type ContainsAssertion = z.infer<typeof ContainsAssertionSchema>;
export type MatchesRegexAssertion = z.infer<typeof MatchesRegexAssertionSchema>;
export type EqualsAssertion = z.infer<typeof EqualsAssertionSchema>;
export type JsonPathAssertion = z.infer<typeof JsonPathAssertionSchema>;
export type FileExistsAssertion = z.infer<typeof FileExistsAssertionSchema>;
export type FileContainsAssertion = z.infer<typeof FileContainsAssertionSchema>;
export type FileJsonPathAssertion = z.infer<typeof FileJsonPathAssertionSchema>;
export type FileNotExistsAssertion = z.infer<
  typeof FileNotExistsAssertionSchema
>;

// ============================================
// Eval Case
// ============================================

export const EvalCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
  assertions: z.array(AssertionSchema).default([]),
  timeout: z.number().optional(),
  tags: z.array(z.string()).default([]),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;

// ============================================
// Agent Config (for suite)
// ============================================

export const AgentConfigSchema = z.object({
  name: z.string(),
  model: SupportedModelSchema,
  instructions: z.string(),
  tools: z.array(z.string()).default([]),
  maxTurns: z.number().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================
// Eval Suite
// ============================================

export const EvalSuiteSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default("1.0.0"),
  agent: AgentConfigSchema,
  defaults: z
    .object({
      timeout: z.number().optional(),
    })
    .optional(),
  cases: z.array(EvalCaseSchema).min(1),
});

export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

// ============================================
// Assertion Result
// ============================================

export const AssertionResultSchema = z.object({
  assertion: AssertionSchema,
  passed: z.boolean(),
  message: z.string(),
  actual: z.unknown().optional(),
  expected: z.unknown().optional(),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;

// ============================================
// Case Result
// ============================================

export const CaseStatusSchema = z.enum(["pass", "fail", "error", "skip"]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const CaseResultSchema = z.object({
  caseId: z.string(),
  caseName: z.string(),
  status: CaseStatusSchema,
  durationMs: z.number(),
  output: z.unknown().nullable(),
  assertionResults: z.array(AssertionResultSchema),
  error: z.string().nullable(),
});

export type CaseResult = z.infer<typeof CaseResultSchema>;

// ============================================
// Suite Result
// ============================================

const BaseSummarySchema = z.object({
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  skipped: z.number(),
  passRate: z.number(),
});

export const SuiteSummarySchema = BaseSummarySchema.extend({
  total: z.number(),
});

export type SuiteSummary = z.infer<typeof SuiteSummarySchema>;

export const SuiteResultSchema = z.object({
  suiteName: z.string(),
  suiteVersion: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number(),
  summary: SuiteSummarySchema,
  cases: z.array(CaseResultSchema),
});

export type SuiteResult = z.infer<typeof SuiteResultSchema>;

// ============================================
// Full Report (multiple suites)
// ============================================

export const ReportSummarySchema = BaseSummarySchema.extend({
  totalSuites: z.number(),
  totalCases: z.number(),
});

export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const EvalReportSchema = z.object({
  generatedAt: z.string(),
  durationMs: z.number(),
  summary: ReportSummarySchema,
  suites: z.array(SuiteResultSchema),
});

export type EvalReport = z.infer<typeof EvalReportSchema>;

// ============================================
// Comparison Report Types
// ============================================

export const ModelSummarySchema = BaseSummarySchema.extend({
  totalCases: z.number(),
  avgDurationMs: z.number(),
  totalDurationMs: z.number(),
});

export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const ComparisonSuiteResultSchema = z.object({
  suiteName: z.string(),
  suiteVersion: z.string(),
  modelResults: z.record(z.string(), SuiteResultSchema),
});

export type ComparisonSuiteResult = z.infer<typeof ComparisonSuiteResultSchema>;

export const ComparisonReportSchema = z.object({
  generatedAt: z.string(),
  models: z.array(z.string()),
  aggregateSummary: z.record(z.string(), ModelSummarySchema),
  suites: z.array(ComparisonSuiteResultSchema),
});

export type ComparisonReport = z.infer<typeof ComparisonReportSchema>;
