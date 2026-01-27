import { AgentRunner } from "~clients/agent-runner";
import type { Logger } from "~clients/logger";

import {
  DEFAULT_CASE_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  STATUS_SYMBOLS,
  ZERO,
} from "../constants";
import type {
  AssertionResult,
  CaseResult,
  CaseStatus,
  EvalCase,
  EvalSuite,
  SuiteResult,
  SuiteSummary,
} from "../schemas";
import { evaluateAssertion } from "../utils/assertions";
import { createToolsFromNames } from "./tool-registry";

export type EvalRunnerConfig = {
  logger: Logger;
  verbose?: boolean;
};

/**
 * Executes evaluation suites and collects results.
 * Creates an AgentRunner for each suite based on its agent config,
 * runs each case, validates outputs, and collects PASS/FAIL results.
 */
export class EvalRunner {
  private logger: Logger;
  private verbose: boolean;

  constructor(config: EvalRunnerConfig) {
    this.logger = config.logger;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Run a single evaluation suite.
   */
  async runSuite(suite: EvalSuite): Promise<SuiteResult> {
    const startedAt = new Date();
    this.logger.info("Running suite", {
      name: suite.name,
      caseCount: suite.cases.length,
    });

    const agentRunner = this.createAgentRunner(suite);

    const caseResults: CaseResult[] = [];
    let passed = ZERO;
    let failed = ZERO;
    let errors = ZERO;
    let skipped = ZERO;

    for (const evalCase of suite.cases) {
      const caseResult = await this.runCase(evalCase, agentRunner, suite);
      caseResults.push(caseResult);

      switch (caseResult.status) {
        case "pass":
          passed++;
          break;
        case "fail":
          failed++;
          break;
        case "error":
          errors++;
          break;
        case "skip":
          skipped++;
          break;
      }

      this.logCaseResult(caseResult);
    }

    const completedAt = new Date();
    const total = suite.cases.length;
    const summary: SuiteSummary = {
      total,
      passed,
      failed,
      errors,
      skipped,
      passRate: total > ZERO ? passed / total : ZERO,
    };

    return {
      suiteName: suite.name,
      suiteVersion: suite.version,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      summary,
      cases: caseResults,
    };
  }

  private logCaseResult(caseResult: CaseResult): void {
    const symbol = STATUS_SYMBOLS[caseResult.status];
    const message = `${symbol} ${caseResult.caseId}: ${caseResult.caseName}`;

    if (caseResult.status === "pass") {
      this.logger.info(message, { durationMs: caseResult.durationMs });
    } else {
      this.logger.warn(message, {
        durationMs: caseResult.durationMs,
        error: caseResult.error,
      });
      if (this.verbose && caseResult.assertionResults.length > ZERO) {
        const failedAssertions = caseResult.assertionResults.filter(
          (r) => !r.passed
        );
        for (const ar of failedAssertions) {
          this.logger.debug("  Assertion failed", { message: ar.message });
        }
      }
    }
  }

  /**
   * Run a single evaluation case.
   */
  private async runCase(
    evalCase: EvalCase,
    agentRunner: AgentRunner<unknown>,
    suite: EvalSuite
  ): Promise<CaseResult> {
    const startTime = Date.now();
    const timeout =
      evalCase.timeout ?? suite.defaults?.timeout ?? DEFAULT_CASE_TIMEOUT_MS;

    this.logger.debug("Running case", { id: evalCase.id, name: evalCase.name });

    try {
      const runPromise = agentRunner.run({
        prompt: evalCase.prompt,
        maxTurns: suite.agent.maxTurns ?? DEFAULT_MAX_TURNS,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Case timed out"));
        }, timeout);
      });

      const result = await Promise.race([runPromise, timeoutPromise]);
      const output: unknown = result.finalOutput;
      const durationMs = Date.now() - startTime;

      const assertionResults = await this.runAssertions(
        evalCase.assertions,
        output
      );

      const allAssertionsPassed = assertionResults.every((r) => r.passed);
      const status: CaseStatus = allAssertionsPassed ? "pass" : "fail";

      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        status,
        durationMs,
        output,
        assertionResults,
        error: null,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        status: "error",
        durationMs,
        output: null,
        assertionResults: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Create an AgentRunner from suite's agent config.
   * Instantiates tools from the tool registry based on suite.agent.tools.
   */
  private createAgentRunner(suite: EvalSuite): AgentRunner<unknown> {
    const tools = createToolsFromNames(suite.agent.tools, {
      logger: this.logger,
    });

    return new AgentRunner({
      name: suite.agent.name,
      model: suite.agent.model,
      tools,
      instructions: suite.agent.instructions,
      logger: this.logger,
      logToolResults: this.verbose,
      stateless: true,
    });
  }

  /**
   * Run all assertions on the output.
   */
  private async runAssertions(
    assertions: EvalCase["assertions"],
    output: unknown
  ): Promise<AssertionResult[]> {
    return Promise.all(
      assertions.map((assertion) => evaluateAssertion(assertion, output))
    );
  }
}
