import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForWrite, TMP_ROOT } from "~tools/utils/fs";

import {
  COMPARISON_REPORTS_SUBDIR,
  DECIMAL_PLACES,
  PERCENT_MULTIPLIER,
  STATUS_SYMBOLS,
  ZERO,
} from "../constants";
import type {
  ComparisonReport,
  ComparisonSuiteResult,
  ModelSummary,
  SuiteResult,
} from "../types/schemas";

export type ComparisonReportFormat = "json" | "md" | "both";

export type ComparisonReportGeneratorConfig = {
  logger: Logger;
  outputDir: string;
  format: ComparisonReportFormat;
};

/**
 * Generates side-by-side model comparison reports in JSON and/or Markdown.
 * Groups suite results by suite name, with models as columns.
 */
export class ComparisonReportGenerator {
  private logger: Logger;
  private outputDir: string;
  private format: ComparisonReportFormat;

  constructor(config: ComparisonReportGeneratorConfig) {
    this.logger = config.logger;
    this.outputDir = config.outputDir;
    this.format = config.format;
  }

  async generate({
    models,
    suiteResultsByModel,
  }: {
    models: string[];
    suiteResultsByModel: Map<string, SuiteResult[]>;
  }): Promise<string[]> {
    const report = this.buildReport({ models, suiteResultsByModel });
    const savedPaths: string[] = [];

    if (this.format === "json" || this.format === "both") {
      const jsonPath = await this.writeJson(report);
      savedPaths.push(jsonPath);
    }

    if (this.format === "md" || this.format === "both") {
      const mdPath = await this.writeMarkdown(report);
      savedPaths.push(mdPath);
    }

    return savedPaths;
  }

  buildReport({
    models,
    suiteResultsByModel,
  }: {
    models: string[];
    suiteResultsByModel: Map<string, SuiteResult[]>;
  }): ComparisonReport {
    const aggregateSummary: Record<string, ModelSummary> = {};

    for (const model of models) {
      const results = suiteResultsByModel.get(model) ?? [];
      aggregateSummary[model] = this.buildModelSummary(results);
    }

    const suiteNames = this.collectSuiteNames(suiteResultsByModel);
    const suites: ComparisonSuiteResult[] = suiteNames.map((suiteName) => {
      const modelResults: Record<string, SuiteResult> = {};
      for (const model of models) {
        const results = suiteResultsByModel.get(model) ?? [];
        const suiteResult = results.find((r) => r.suiteName === suiteName);
        if (suiteResult) {
          modelResults[model] = suiteResult;
        }
      }

      const firstResult = Object.values(modelResults)[ZERO];
      return {
        suiteName,
        suiteVersion: firstResult?.suiteVersion ?? "unknown",
        modelResults,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      models,
      aggregateSummary,
      suites,
    };
  }

  private buildModelSummary(results: SuiteResult[]): ModelSummary {
    let totalCases = ZERO;
    let passed = ZERO;
    let failed = ZERO;
    let errors = ZERO;
    let skipped = ZERO;
    let totalDurationMs = ZERO;

    for (const result of results) {
      totalCases += result.summary.total;
      passed += result.summary.passed;
      failed += result.summary.failed;
      errors += result.summary.errors;
      skipped += result.summary.skipped;
      totalDurationMs += result.durationMs;
    }

    return {
      totalCases,
      passed,
      failed,
      errors,
      skipped,
      passRate: totalCases > ZERO ? passed / totalCases : ZERO,
      avgDurationMs:
        totalCases > ZERO ? Math.round(totalDurationMs / totalCases) : ZERO,
      totalDurationMs,
    };
  }

  private collectSuiteNames(
    suiteResultsByModel: Map<string, SuiteResult[]>
  ): string[] {
    const names = new Set<string>();
    for (const results of suiteResultsByModel.values()) {
      for (const result of results) {
        names.add(result.suiteName);
      }
    }
    return [...names];
  }

  formatMarkdown(report: ComparisonReport): string {
    const lines: string[] = [];

    lines.push("# Model Comparison Report");
    lines.push("");
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Models: ${report.models.join(", ")}`);
    lines.push("");

    lines.push("## Aggregate Summary");
    lines.push("");
    this.appendAggregateSummaryTable(lines, report);

    for (const suite of report.suites) {
      lines.push(`## Suite: ${suite.suiteName}`);
      lines.push("");
      lines.push(`Version: ${suite.suiteVersion}`);
      lines.push("");
      this.appendCaseResultsTable(lines, suite, report.models);
      this.appendFailuresSection(lines, suite, report.models);
    }

    return lines.join("\n");
  }

  private appendAggregateSummaryTable(
    lines: string[],
    report: ComparisonReport
  ): void {
    const models = report.models;
    const header = `| Metric | ${models.join(" | ")} |`;
    const separator = `|--------|${models.map(() => "--------").join("|")}|`;

    lines.push(header);
    lines.push(separator);

    const metrics: { label: string; getValue: (s: ModelSummary) => string }[] =
      [
        { label: "Total Cases", getValue: (s) => String(s.totalCases) },
        { label: "Passed", getValue: (s) => String(s.passed) },
        { label: "Failed", getValue: (s) => String(s.failed) },
        { label: "Errors", getValue: (s) => String(s.errors) },
        { label: "Skipped", getValue: (s) => String(s.skipped) },
        {
          label: "Pass Rate",
          getValue: (s) => this.formatPercent(s.passRate),
        },
        {
          label: "Avg Duration",
          getValue: (s) =>
            `${s.avgDurationMs.toFixed(DECIMAL_PLACES.duration)}ms`,
        },
        {
          label: "Total Duration",
          getValue: (s) =>
            `${s.totalDurationMs.toFixed(DECIMAL_PLACES.duration)}ms`,
        },
      ];

    for (const metric of metrics) {
      const values = models.map((m) => {
        const summary = report.aggregateSummary[m];
        return summary ? metric.getValue(summary) : "N/A";
      });
      lines.push(`| ${metric.label} | ${values.join(" | ")} |`);
    }
    lines.push("");
  }

  private appendCaseResultsTable(
    lines: string[],
    suite: ComparisonSuiteResult,
    models: string[]
  ): void {
    lines.push("### Cases");
    lines.push("");

    const header = `| Case | ${models.join(" | ")} |`;
    const separator = `|------|${models.map(() => "--------").join("|")}|`;

    lines.push(header);
    lines.push(separator);

    const allCaseIds = this.collectCaseIds(suite, models);

    for (const caseId of allCaseIds) {
      const values = models.map((model) => {
        const suiteResult = suite.modelResults[model];
        const caseResult = suiteResult?.cases.find((c) => c.caseId === caseId);
        if (!caseResult) {
          return "N/A";
        }
        const status = STATUS_SYMBOLS[caseResult.status];
        return `${status} ${caseResult.durationMs}ms`;
      });
      lines.push(`| ${caseId} | ${values.join(" | ")} |`);
    }
    lines.push("");
  }

  private appendFailuresSection(
    lines: string[],
    suite: ComparisonSuiteResult,
    models: string[]
  ): void {
    const hasFailures = models.some((model) => {
      const suiteResult = suite.modelResults[model];
      return suiteResult?.cases.some(
        (c) => c.status === "fail" || c.status === "error"
      );
    });

    if (!hasFailures) {
      return;
    }

    lines.push("### Failures & Errors");
    lines.push("");

    for (const model of models) {
      const suiteResult = suite.modelResults[model];
      if (!suiteResult) {
        continue;
      }

      const problemCases = suiteResult.cases.filter(
        (c) => c.status === "fail" || c.status === "error"
      );
      if (problemCases.length === ZERO) {
        continue;
      }

      lines.push(`#### ${model}`);
      lines.push("");
      for (const caseResult of problemCases) {
        lines.push(`- **${caseResult.caseId}**: ${caseResult.caseName}`);
        if (caseResult.error) {
          lines.push(`  - Error: ${caseResult.error}`);
        }
        for (const ar of caseResult.assertionResults) {
          if (!ar.passed) {
            lines.push(`  - ${ar.assertion.type}: ${ar.message}`);
          }
        }
      }
      lines.push("");
    }
  }

  private collectCaseIds(
    suite: ComparisonSuiteResult,
    models: string[]
  ): string[] {
    const ids = new Set<string>();
    for (const model of models) {
      const suiteResult = suite.modelResults[model];
      if (suiteResult) {
        for (const c of suiteResult.cases) {
          ids.add(c.caseId);
        }
      }
    }
    return [...ids];
  }

  private async writeJson(report: ComparisonReport): Promise<string> {
    const timestamp = this.getTimestamp();
    const filename = `comparison-${timestamp}.json`;
    const relativePath = path.join(
      this.outputDir,
      COMPARISON_REPORTS_SUBDIR,
      filename
    );
    const fullPath = await resolveTmpPathForWrite(relativePath);

    await fs.writeFile(fullPath, JSON.stringify(report, null, 2), "utf8");
    const displayPath = this.toDisplayPath(fullPath);
    this.logger.info("JSON comparison report saved", { path: displayPath });
    return displayPath;
  }

  private async writeMarkdown(report: ComparisonReport): Promise<string> {
    const timestamp = this.getTimestamp();
    const filename = `comparison-${timestamp}.md`;
    const relativePath = path.join(
      this.outputDir,
      COMPARISON_REPORTS_SUBDIR,
      filename
    );
    const fullPath = await resolveTmpPathForWrite(relativePath);

    const markdown = this.formatMarkdown(report);
    await fs.writeFile(fullPath, markdown, "utf8");
    const displayPath = this.toDisplayPath(fullPath);
    this.logger.info("Markdown comparison report saved", {
      path: displayPath,
    });
    return displayPath;
  }

  private toDisplayPath(fullPath: string): string {
    const relativePath = path.relative(TMP_ROOT, fullPath);
    return path.join("tmp", relativePath);
  }

  private formatPercent(value: number): string {
    return `${(value * PERCENT_MULTIPLIER).toFixed(DECIMAL_PLACES.passRate)}%`;
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }
}
