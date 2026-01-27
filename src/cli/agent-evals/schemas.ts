import { z } from "zod";

import {
  DEFAULT_OUT_PATH,
  DEFAULT_REPORT_FORMAT,
  DEFAULT_VERBOSE,
} from "./constants";

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
  })
  .refine((data) => data.suite ?? data.all, {
    message: "Either --suite <name> or --all is required",
  });

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

export const AssertionSchema = z.discriminatedUnion("type", [
  ContainsAssertionSchema,
  MatchesRegexAssertionSchema,
  EqualsAssertionSchema,
  JsonPathAssertionSchema,
]);

export type Assertion = z.infer<typeof AssertionSchema>;
export type ContainsAssertion = z.infer<typeof ContainsAssertionSchema>;
export type MatchesRegexAssertion = z.infer<typeof MatchesRegexAssertionSchema>;
export type EqualsAssertion = z.infer<typeof EqualsAssertionSchema>;
export type JsonPathAssertion = z.infer<typeof JsonPathAssertionSchema>;

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
  model: z.literal("gpt-5-mini"),
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

export const SuiteSummarySchema = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  skipped: z.number(),
  passRate: z.number(),
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

export const ReportSummarySchema = z.object({
  totalSuites: z.number(),
  totalCases: z.number(),
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  skipped: z.number(),
  passRate: z.number(),
});

export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const EvalReportSchema = z.object({
  generatedAt: z.string(),
  durationMs: z.number(),
  summary: ReportSummarySchema,
  suites: z.array(SuiteResultSchema),
});

export type EvalReport = z.infer<typeof EvalReportSchema>;
