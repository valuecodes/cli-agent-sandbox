import fs from "node:fs/promises";
import path from "node:path";

import type { Logger } from "~clients/logger";
import { TMP_ROOT } from "~tools/utils/fs";

import { LINE_WIDTH, PERCENT_MULTIPLIER, ZERO } from "../constants";
import type { EvalSuite, SuiteResult, SupportedModel } from "../types/schemas";
import { ComparisonReportGenerator } from "./comparison-report-generator";
import { EvalRunner } from "./eval-runner";
import { ReportGenerator } from "./report-generator";
import { SuiteLoader } from "./suite-loader";

export type EvalPipelineConfig = {
  logger: Logger;
  verbose: boolean;
};

export type EvalRunOptions = {
  suite?: string;
  all: boolean;
  compare?: SupportedModel[];
  report: "json" | "md" | "both";
  out: string;
};

/**
 * Orchestrates the full eval pipeline: loads suites, runs evaluations
 * (single or comparison mode), and generates reports.
 */
export class EvalPipeline {
  private logger: Logger;
  private verbose: boolean;

  constructor({ logger, verbose }: EvalPipelineConfig) {
    this.logger = logger;
    this.verbose = verbose;
  }

  async run(options: EvalRunOptions): Promise<void> {
    const suites = await this.loadSuites(options);

    if (options.compare) {
      await this.runComparison(suites, options, options.compare);
    } else {
      await this.runEvaluation(suites, options);
    }
  }

  private async loadSuites({
    suite,
    all,
  }: Pick<EvalRunOptions, "suite" | "all">): Promise<EvalSuite[]> {
    const suiteLoader = new SuiteLoader({ logger: this.logger });

    let suitesToRun: EvalSuite[];
    if (all) {
      this.logger.info("Loading all suites...");
      suitesToRun = await suiteLoader.loadAll();
    } else if (suite) {
      this.logger.info("Loading suite", { name: suite });
      const singleSuite = await suiteLoader.load(suite);
      suitesToRun = [singleSuite];
    } else {
      throw new Error("Either --suite or --all is required");
    }

    if (suitesToRun.length === ZERO) {
      this.logger.warn("No suites found to run");
      return [];
    }

    this.logger.info("Suites to run", { count: suitesToRun.length });
    return suitesToRun;
  }

  private async runEvaluation(
    suites: EvalSuite[],
    options: EvalRunOptions
  ): Promise<void> {
    if (suites.length === ZERO) {
      return;
    }

    const evalRunner = new EvalRunner({
      logger: this.logger,
      verbose: this.verbose,
    });
    const reportGenerator = new ReportGenerator({
      logger: this.logger,
      outputDir: options.out,
      format: options.report,
    });

    const separator = "=".repeat(LINE_WIDTH);
    const suiteResults: SuiteResult[] = [];

    for (const evalSuite of suites) {
      this.logger.info(separator);
      const result = await evalRunner.runSuite(evalSuite);
      suiteResults.push(result);
    }

    this.logger.info(separator);
    this.logger.info("Generating reports...");
    const reportPaths = await reportGenerator.generate(suiteResults);

    const totalCases = suiteResults.reduce(
      (sum, s) => sum + s.summary.total,
      ZERO
    );
    const totalPassed = suiteResults.reduce(
      (sum, s) => sum + s.summary.passed,
      ZERO
    );
    const totalFailed = suiteResults.reduce(
      (sum, s) => sum + s.summary.failed,
      ZERO
    );
    const totalErrors = suiteResults.reduce(
      (sum, s) => sum + s.summary.errors,
      ZERO
    );
    const passRate =
      totalCases > ZERO
        ? (totalPassed / totalCases) * PERCENT_MULTIPLIER
        : ZERO;

    this.logger.info(separator);
    this.logger.info("EVALUATION COMPLETE");
    this.logger.info(separator);
    this.logger.info("Summary", {
      suites: suiteResults.length,
      cases: totalCases,
      passed: totalPassed,
      failed: totalFailed,
      errors: totalErrors,
      passRate: `${passRate.toFixed(1)}%`,
    });
    this.logger.info("Reports saved", { paths: reportPaths });

    if (totalFailed > ZERO || totalErrors > ZERO) {
      process.exit(1);
    }

    this.logger.info("Agent Evals completed.");
  }

  private async runComparison(
    suites: EvalSuite[],
    options: EvalRunOptions,
    models: SupportedModel[]
  ): Promise<void> {
    if (suites.length === ZERO) {
      return;
    }
    const evalRunner = new EvalRunner({
      logger: this.logger,
      verbose: this.verbose,
    });

    this.logger.info("Comparison mode", { models });

    const separator = "=".repeat(LINE_WIDTH);
    const suiteResultsByModel = new Map<string, SuiteResult[]>();

    for (const model of models) {
      await this.cleanEvalWorkDir(options.out);
      this.logger.info(separator);
      this.logger.info("Running suites with model", { model });
      const modelResults: SuiteResult[] = [];

      for (const evalSuite of suites) {
        this.logger.info(separator);
        const result = await evalRunner.runSuiteWithModel({
          suite: evalSuite,
          model,
        });
        modelResults.push(result);
      }

      suiteResultsByModel.set(model, modelResults);
    }

    this.logger.info(separator);
    this.logger.info("Generating comparison reports...");

    const comparisonReportGenerator = new ComparisonReportGenerator({
      logger: this.logger,
      outputDir: options.out,
      format: options.report,
    });

    const reportPaths = await comparisonReportGenerator.generate({
      models,
      suiteResultsByModel,
    });

    this.logger.info(separator);
    this.logger.info("COMPARISON COMPLETE");
    this.logger.info(separator);

    for (const model of models) {
      const results = suiteResultsByModel.get(model) ?? [];
      const totalCases = results.reduce(
        (sum, s) => sum + s.summary.total,
        ZERO
      );
      const totalPassed = results.reduce(
        (sum, s) => sum + s.summary.passed,
        ZERO
      );
      const passRate =
        totalCases > ZERO
          ? (totalPassed / totalCases) * PERCENT_MULTIPLIER
          : ZERO;
      this.logger.info("Model summary", {
        model,
        cases: totalCases,
        passed: totalPassed,
        passRate: `${passRate.toFixed(1)}%`,
      });
    }

    this.logger.info("Reports saved", { paths: reportPaths });
    this.logger.info("Agent Evals completed.");
  }

  /**
   * Remove the eval working directory under tmp/ so each model
   * in comparison mode starts with a clean filesystem.
   */
  private async cleanEvalWorkDir(outPath: string): Promise<void> {
    const workDir = path.resolve(TMP_ROOT, outPath);
    await fs.rm(workDir, { recursive: true, force: true });
    this.logger.debug("Cleaned eval work directory", { path: workDir });
  }
}
