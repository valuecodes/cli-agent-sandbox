import { Logger } from "~clients/logger";
import { describe, expect, it } from "vitest";

import type { ComparisonReport, SuiteResult } from "../types/schemas";
import { ComparisonReportGenerator } from "./comparison-report-generator";

const assertDefined = <T>(value: T | undefined): T => {
  expect(value).toBeDefined();
  return value as T;
};

const createSuiteResult = (
  overrides: Partial<SuiteResult> = {}
): SuiteResult => ({
  suiteName: "test-suite",
  suiteVersion: "1.0.0",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  durationMs: 1000,
  summary: {
    total: 2,
    passed: 2,
    failed: 0,
    errors: 0,
    skipped: 0,
    passRate: 1,
  },
  cases: [
    {
      caseId: "case-1",
      caseName: "Test Case 1",
      status: "pass",
      durationMs: 500,
      output: "result",
      assertionResults: [],
      error: null,
    },
    {
      caseId: "case-2",
      caseName: "Test Case 2",
      status: "pass",
      durationMs: 500,
      output: "result",
      assertionResults: [],
      error: null,
    },
  ],
  ...overrides,
});

describe("ComparisonReportGenerator", () => {
  const logger = new Logger({ level: "error" });

  const createGenerator = () =>
    new ComparisonReportGenerator({
      logger,
      outputDir: "agent-evals",
      format: "json",
    });

  describe("buildReport", () => {
    it("aggregates summaries per model", () => {
      const generator = createGenerator();
      const models = ["gpt-5-mini", "gpt-4.1-nano"];

      const suiteResultsByModel = new Map<string, SuiteResult[]>();
      suiteResultsByModel.set("gpt-5-mini", [createSuiteResult()]);
      suiteResultsByModel.set("gpt-4.1-nano", [
        createSuiteResult({
          durationMs: 800,
          summary: {
            total: 2,
            passed: 1,
            failed: 1,
            errors: 0,
            skipped: 0,
            passRate: 0.5,
          },
        }),
      ]);

      const report = generator.buildReport({ models, suiteResultsByModel });

      expect(report.models).toEqual(models);

      const miniSummary = assertDefined(report.aggregateSummary["gpt-5-mini"]);
      expect(miniSummary.passRate).toBe(1);
      expect(miniSummary.totalCases).toBe(2);
      expect(miniSummary.totalDurationMs).toBe(1000);

      const nanoSummary = assertDefined(
        report.aggregateSummary["gpt-4.1-nano"]
      );
      expect(nanoSummary.passRate).toBe(0.5);
      expect(nanoSummary.failed).toBe(1);
    });

    it("groups results by suite name", () => {
      const generator = createGenerator();
      const models = ["gpt-5-mini", "gpt-4.1-nano"];

      const suiteResultsByModel = new Map<string, SuiteResult[]>();
      suiteResultsByModel.set("gpt-5-mini", [
        createSuiteResult({ suiteName: "suite-a" }),
        createSuiteResult({ suiteName: "suite-b" }),
      ]);
      suiteResultsByModel.set("gpt-4.1-nano", [
        createSuiteResult({ suiteName: "suite-a" }),
        createSuiteResult({ suiteName: "suite-b" }),
      ]);

      const report = generator.buildReport({ models, suiteResultsByModel });

      expect(report.suites).toHaveLength(2);

      const suiteA = assertDefined(report.suites[0]);
      const suiteB = assertDefined(report.suites[1]);
      expect(suiteA.suiteName).toBe("suite-a");
      expect(suiteB.suiteName).toBe("suite-b");
      expect(suiteA.modelResults["gpt-5-mini"]).toBeDefined();
      expect(suiteA.modelResults["gpt-4.1-nano"]).toBeDefined();
    });

    it("computes avgDurationMs correctly", () => {
      const generator = createGenerator();
      const models = ["gpt-5-mini"];

      const suiteResultsByModel = new Map<string, SuiteResult[]>();
      suiteResultsByModel.set("gpt-5-mini", [
        createSuiteResult({ durationMs: 1000 }),
        createSuiteResult({ durationMs: 3000 }),
      ]);

      const report = generator.buildReport({ models, suiteResultsByModel });

      // 4 total cases, 4000ms total → 1000ms avg
      const summary = assertDefined(report.aggregateSummary["gpt-5-mini"]);
      expect(summary.avgDurationMs).toBe(1000);
    });

    it("handles missing model results gracefully", () => {
      const generator = createGenerator();
      const models = ["gpt-5-mini", "gpt-4.1-nano"];

      const suiteResultsByModel = new Map<string, SuiteResult[]>();
      suiteResultsByModel.set("gpt-5-mini", [createSuiteResult()]);
      // gpt-4.1-nano has no results

      const report = generator.buildReport({ models, suiteResultsByModel });

      const nanoSummary = assertDefined(
        report.aggregateSummary["gpt-4.1-nano"]
      );
      expect(nanoSummary.totalCases).toBe(0);
      expect(nanoSummary.passRate).toBe(0);
      expect(nanoSummary.avgDurationMs).toBe(0);
    });

    it("sets generatedAt timestamp", () => {
      const generator = createGenerator();
      const report = generator.buildReport({
        models: ["gpt-5-mini"],
        suiteResultsByModel: new Map([["gpt-5-mini", [createSuiteResult()]]]),
      });

      expect(report.generatedAt).toBeDefined();
      expect(() => new Date(report.generatedAt)).not.toThrow();
    });
  });

  describe("formatMarkdown", () => {
    const buildTestReport = (): ComparisonReport => {
      const generator = createGenerator();
      const models = ["gpt-5-mini", "gpt-4.1-nano"];

      const suiteResultsByModel = new Map<string, SuiteResult[]>();
      suiteResultsByModel.set("gpt-5-mini", [createSuiteResult()]);
      suiteResultsByModel.set("gpt-4.1-nano", [
        createSuiteResult({
          durationMs: 800,
          summary: {
            total: 2,
            passed: 1,
            failed: 1,
            errors: 0,
            skipped: 0,
            passRate: 0.5,
          },
          cases: [
            {
              caseId: "case-1",
              caseName: "Test Case 1",
              status: "pass",
              durationMs: 400,
              output: "result",
              assertionResults: [],
              error: null,
            },
            {
              caseId: "case-2",
              caseName: "Test Case 2",
              status: "fail",
              durationMs: 400,
              output: "wrong",
              assertionResults: [
                {
                  assertion: { type: "contains", value: "expected" },
                  passed: false,
                  message: "Output does not contain 'expected'",
                },
              ],
              error: null,
            },
          ],
        }),
      ]);

      return generator.buildReport({ models, suiteResultsByModel });
    };

    it("includes report title", () => {
      const generator = createGenerator();
      const report = buildTestReport();
      const md = generator.formatMarkdown(report);

      expect(md).toContain("# Model Comparison Report");
    });

    it("includes aggregate summary table with models as columns", () => {
      const generator = createGenerator();
      const report = buildTestReport();
      const md = generator.formatMarkdown(report);

      expect(md).toContain("## Aggregate Summary");
      expect(md).toContain("| Metric | gpt-5-mini | gpt-4.1-nano |");
      expect(md).toContain("| Pass Rate | 100.0% | 50.0% |");
    });

    it("includes per-suite case results table", () => {
      const generator = createGenerator();
      const report = buildTestReport();
      const md = generator.formatMarkdown(report);

      expect(md).toContain("### Cases");
      expect(md).toContain("| Case | gpt-5-mini | gpt-4.1-nano |");
      expect(md).toContain("[PASS]");
    });

    it("includes failures section when there are failures", () => {
      const generator = createGenerator();
      const report = buildTestReport();
      const md = generator.formatMarkdown(report);

      expect(md).toContain("### Failures & Errors");
      expect(md).toContain("#### gpt-4.1-nano");
      expect(md).toContain("case-2");
      expect(md).toContain("does not contain");
    });

    it("omits failures section when all pass", () => {
      const generator = createGenerator();
      const models = ["gpt-5-mini"];
      const suiteResultsByModel = new Map<string, SuiteResult[]>();
      suiteResultsByModel.set("gpt-5-mini", [createSuiteResult()]);

      const report = generator.buildReport({ models, suiteResultsByModel });
      const md = generator.formatMarkdown(report);

      expect(md).not.toContain("### Failures & Errors");
    });
  });
});
