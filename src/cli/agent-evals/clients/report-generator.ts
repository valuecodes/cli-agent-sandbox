import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForWrite, TMP_ROOT } from "~tools/utils/fs";

import {
  DECIMAL_PLACES,
  PERCENT_MULTIPLIER,
  REPORTS_SUBDIR,
  STATUS_SYMBOLS,
} from "../constants";
import type { EvalReport, ReportSummary, SuiteResult } from "../schemas";

export type ReportFormat = "json" | "md" | "both";

export type ReportGeneratorConfig = {
  logger: Logger;
  outputDir: string;
  format: ReportFormat;
};

/**
 * Generates evaluation reports in JSON and/or Markdown format.
 * Reports are written to the configured output directory under tmp/,
 * inside a dedicated reports/ subfolder.
 */
export class ReportGenerator {
  private logger: Logger;
  private outputDir: string;
  private format: ReportFormat;

  constructor(config: ReportGeneratorConfig) {
    this.logger = config.logger;
    this.outputDir = config.outputDir;
    this.format = config.format;
  }

  /**
   * Generate and save report(s) from suite results.
   * Returns the paths of saved reports.
   */
  async generate(suiteResults: SuiteResult[]): Promise<string[]> {
    const report = this.buildReport(suiteResults);
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

  private buildReport(suiteResults: SuiteResult[]): EvalReport {
    const totalCases = suiteResults.reduce(
      (sum, s) => sum + s.summary.total,
      0
    );
    const passed = suiteResults.reduce((sum, s) => sum + s.summary.passed, 0);
    const failed = suiteResults.reduce((sum, s) => sum + s.summary.failed, 0);
    const errors = suiteResults.reduce((sum, s) => sum + s.summary.errors, 0);
    const skipped = suiteResults.reduce((sum, s) => sum + s.summary.skipped, 0);
    const durationMs = suiteResults.reduce((sum, s) => sum + s.durationMs, 0);

    const summary: ReportSummary = {
      totalSuites: suiteResults.length,
      totalCases,
      passed,
      failed,
      errors,
      skipped,
      passRate: totalCases > 0 ? passed / totalCases : 0,
    };

    return {
      generatedAt: new Date().toISOString(),
      durationMs,
      summary,
      suites: suiteResults,
    };
  }

  private async writeJson(report: EvalReport): Promise<string> {
    const timestamp = this.getTimestamp();
    const filename = `report-${timestamp}.json`;
    const relativePath = path.join(this.outputDir, REPORTS_SUBDIR, filename);
    const fullPath = await resolveTmpPathForWrite(relativePath);

    await fs.writeFile(fullPath, JSON.stringify(report, null, 2), "utf8");
    const displayPath = this.toDisplayPath(fullPath);
    this.logger.info("JSON report saved", { path: displayPath });
    return displayPath;
  }

  private async writeMarkdown(report: EvalReport): Promise<string> {
    const timestamp = this.getTimestamp();
    const filename = `report-${timestamp}.md`;
    const relativePath = path.join(this.outputDir, REPORTS_SUBDIR, filename);
    const fullPath = await resolveTmpPathForWrite(relativePath);

    const markdown = this.formatMarkdown(report);
    await fs.writeFile(fullPath, markdown, "utf8");
    const displayPath = this.toDisplayPath(fullPath);
    this.logger.info("Markdown report saved", { path: displayPath });
    return displayPath;
  }

  private toDisplayPath(fullPath: string): string {
    const relativePath = path.relative(TMP_ROOT, fullPath);
    return path.join("tmp", relativePath);
  }

  private formatMarkdown(report: EvalReport): string {
    const lines: string[] = [];

    lines.push("# Agent Evaluation Report");
    lines.push("");
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Duration: ${report.durationMs}ms`);
    lines.push("");

    lines.push("## Summary");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Total Suites | ${report.summary.totalSuites} |`);
    lines.push(`| Total Cases | ${report.summary.totalCases} |`);
    lines.push(`| Passed | ${report.summary.passed} |`);
    lines.push(`| Failed | ${report.summary.failed} |`);
    lines.push(`| Errors | ${report.summary.errors} |`);
    lines.push(`| Skipped | ${report.summary.skipped} |`);
    lines.push(
      `| Pass Rate | ${this.formatPercent(report.summary.passRate)} |`
    );
    lines.push("");

    for (const suite of report.suites) {
      lines.push(`## Suite: ${suite.suiteName}`);
      lines.push("");
      lines.push(`Version: ${suite.suiteVersion}`);
      lines.push(`Duration: ${suite.durationMs}ms`);
      lines.push(
        `Pass Rate: ${this.formatPercent(suite.summary.passRate)} (${suite.summary.passed}/${suite.summary.total})`
      );
      lines.push("");

      lines.push("### Cases");
      lines.push("");
      lines.push("| Status | ID | Name | Duration |");
      lines.push("|--------|-----|------|----------|");

      for (const caseResult of suite.cases) {
        const status = STATUS_SYMBOLS[caseResult.status];
        lines.push(
          `| ${status} | ${caseResult.caseId} | ${caseResult.caseName} | ${caseResult.durationMs}ms |`
        );
      }
      lines.push("");

      const problemCases = suite.cases.filter(
        (c) => c.status === "fail" || c.status === "error"
      );
      if (problemCases.length > 0) {
        lines.push("### Details");
        lines.push("");
        for (const caseResult of problemCases) {
          lines.push(`#### ${caseResult.caseId}: ${caseResult.caseName}`);
          lines.push("");
          if (caseResult.error) {
            lines.push(`**Error:** ${caseResult.error}`);
          }
          if (caseResult.assertionResults.length > 0) {
            lines.push("**Assertion Results:**");
            for (const ar of caseResult.assertionResults) {
              const icon = ar.passed ? "OK" : "FAIL";
              lines.push(`- [${icon}] ${ar.assertion.type}: ${ar.message}`);
            }
          }
          lines.push("");
        }
      }
    }

    return lines.join("\n");
  }

  private formatPercent(value: number): string {
    return `${(value * PERCENT_MULTIPLIER).toFixed(DECIMAL_PLACES.passRate)}%`;
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }
}
