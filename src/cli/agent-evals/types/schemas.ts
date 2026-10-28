import { z } from "zod";

import {
  DEFAULT_OUT_PATH,
  DEFAULT_REPORT_FORMAT,
  DEFAULT_VERBOSE,
} from "../constants";

// ============================================
// CLI Arguments
// ============================================

const CliArgsSchema = z
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

// ============================================
// Assertion Types
// ============================================

const ContainsAssertionSchema = z.object({
  type: z.literal("contains"),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
  description: z.string().optional(),
});

const MatchesRegexAssertionSchema = z.object({
  type: z.literal("matchesRegex"),
  pattern: z.string(),
  flags: z.string().optional(),
  description: z.string().optional(),
});

const EqualsAssertionSchema = z.object({
  type: z.literal("equals"),
  expected: z.unknown(),
  description: z.string().optional(),
});

const JsonPathAssertionSchema = z.object({
  type: z.literal("jsonPath"),
  path: z.string(),
  expected: z.unknown(),
  description: z.string().optional(),
});

// ============================================
// File Assertion Types (for verifying tool side effects)
// ============================================

const FileExistsAssertionSchema = z.object({
  type: z.literal("fileExists"),
  path: z.string(),
  description: z.string().optional(),
});

const FileContainsAssertionSchema = z.object({
  type: z.literal("fileContains"),
  path: z.string(),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
  description: z.string().optional(),
});

const FileJsonPathAssertionSchema = z.object({
  type: z.literal("fileJsonPath"),
  path: z.string(),
  jsonPath: z.string(),
  expected: z.unknown(),
  description: z.string().optional(),
});

const FileNotExistsAssertionSchema = z.object({
  type: z.literal("fileNotExists"),
  path: z.string(),
  description: z.string().optional(),
});

const AssertionSchema = z.discriminatedUnion("type", [
  ContainsAssertionSchema,
  MatchesRegexAssertionSchema,
  EqualsAssertionSchema,
  JsonPathAssertionSchema,
  FileExistsAssertionSchema,
  FileContainsAssertionSchema,
  FileJsonPathAssertionSchema,
  FileNotExistsAssertionSchema,
]);

type Assertion = z.infer<typeof AssertionSchema>;
type ContainsAssertion = z.infer<typeof ContainsAssertionSchema>;
type MatchesRegexAssertion = z.infer<typeof MatchesRegexAssertionSchema>;
type EqualsAssertion = z.infer<typeof EqualsAssertionSchema>;
type JsonPathAssertion = z.infer<typeof JsonPathAssertionSchema>;
type FileExistsAssertion = z.infer<typeof FileExistsAssertionSchema>;
type FileContainsAssertion = z.infer<typeof FileContainsAssertionSchema>;
type FileJsonPathAssertion = z.infer<typeof FileJsonPathAssertionSchema>;
type FileNotExistsAssertion = z.infer<typeof FileNotExistsAssertionSchema>;

// ============================================
// Eval Case
// ============================================

const EvalCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
  assertions: z.array(AssertionSchema).default([]),
  timeout: z.number().optional(),
  tags: z.array(z.string()).default([]),
});

type EvalCase = z.infer<typeof EvalCaseSchema>;

// ============================================
// Agent Config (for suite)
// ============================================

const AgentConfigSchema = z.object({
  name: z.string(),
  model: z.literal("gpt-5-mini"),
  instructions: z.string(),
  tools: z.array(z.string()).default([]),
  maxTurns: z.number().optional(),
});

// ============================================
// Eval Suite
// ============================================

const EvalSuiteSchema = z.object({
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

type EvalSuite = z.infer<typeof EvalSuiteSchema>;

// ============================================
// Assertion Result
// ============================================

const AssertionResultSchema = z.object({
  assertion: AssertionSchema,
  passed: z.boolean(),
  message: z.string(),
  actual: z.unknown().optional(),
  expected: z.unknown().optional(),
});

type AssertionResult = z.infer<typeof AssertionResultSchema>;

// ============================================
// Case Result
// ============================================

const CaseStatusSchema = z.enum(["pass", "fail", "error", "skip"]);
type CaseStatus = z.infer<typeof CaseStatusSchema>;

const CaseResultSchema = z.object({
  caseId: z.string(),
  caseName: z.string(),
  status: CaseStatusSchema,
  durationMs: z.number(),
  output: z.unknown().nullable(),
  assertionResults: z.array(AssertionResultSchema),
  error: z.string().nullable(),
});

type CaseResult = z.infer<typeof CaseResultSchema>;

// ============================================
// Suite Result
// ============================================

const SuiteSummarySchema = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  skipped: z.number(),
  passRate: z.number(),
});

type SuiteSummary = z.infer<typeof SuiteSummarySchema>;

const SuiteResultSchema = z.object({
  suiteName: z.string(),
  suiteVersion: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number(),
  summary: SuiteSummarySchema,
  cases: z.array(CaseResultSchema),
});

type SuiteResult = z.infer<typeof SuiteResultSchema>;

// ============================================
// Full Report (multiple suites)
// ============================================

const ReportSummarySchema = z.object({
  totalSuites: z.number(),
  totalCases: z.number(),
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  skipped: z.number(),
  passRate: z.number(),
});

type ReportSummary = z.infer<typeof ReportSummarySchema>;

const EvalReportSchema = z.object({
  generatedAt: z.string(),
  durationMs: z.number(),
  summary: ReportSummarySchema,
  suites: z.array(SuiteResultSchema),
});

type EvalReport = z.infer<typeof EvalReportSchema>;

export type {
  Assertion,
  AssertionResult,
  CaseResult,
  CaseStatus,
  ContainsAssertion,
  EqualsAssertion,
  EvalCase,
  EvalReport,
  EvalSuite,
  FileContainsAssertion,
  FileExistsAssertion,
  FileJsonPathAssertion,
  FileNotExistsAssertion,
  JsonPathAssertion,
  MatchesRegexAssertion,
  ReportSummary,
  SuiteResult,
  SuiteSummary,
};
export {
  AgentConfigSchema,
  AssertionResultSchema,
  AssertionSchema,
  CaseResultSchema,
  CaseStatusSchema,
  CliArgsSchema,
  ContainsAssertionSchema,
  EqualsAssertionSchema,
  EvalCaseSchema,
  EvalReportSchema,
  EvalSuiteSchema,
  FileContainsAssertionSchema,
  FileExistsAssertionSchema,
  FileJsonPathAssertionSchema,
  FileNotExistsAssertionSchema,
  JsonPathAssertionSchema,
  MatchesRegexAssertionSchema,
  ReportSummarySchema,
  SuiteResultSchema,
  SuiteSummarySchema,
};
