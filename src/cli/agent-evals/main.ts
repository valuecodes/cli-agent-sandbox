// pnpm run:agent-evals

// Run automated evaluation cases for AI agents with PASS/FAIL results and reports

import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { EvalRunner } from "./clients/eval-runner";
import { ReportGenerator } from "./clients/report-generator";
import { SuiteLoader } from "./clients/suite-loader";
import { LINE_WIDTH, PERCENT_MULTIPLIER, ZERO } from "./constants";
import type { SuiteResult } from "./schemas";
import { CliArgsSchema } from "./schemas";

const logger = new Logger();

logger.info("Agent Evals starting...");

const { suite, all, report, out, verbose } = parseArgs({
  logger,
  schema: CliArgsSchema,
});

if (verbose) {
  logger.debug("Verbose mode enabled");
}

const suiteLoader = new SuiteLoader({ logger });
const evalRunner = new EvalRunner({ logger, verbose });
const reportGenerator = new ReportGenerator({
  logger,
  outputDir: out,
  format: report,
});

let suitesToRun;
if (all) {
  logger.info("Loading all suites...");
  suitesToRun = await suiteLoader.loadAll();
} else if (suite) {
  logger.info("Loading suite", { name: suite });
  const singleSuite = await suiteLoader.load(suite);
  suitesToRun = [singleSuite];
} else {
  logger.error("Either --suite or --all is required");
  process.exit(1);
}

if (suitesToRun.length === ZERO) {
  logger.warn("No suites found to run");
  process.exit(0);
}

logger.info("Suites to run", { count: suitesToRun.length });

const suiteResults: SuiteResult[] = [];
const separator = "=".repeat(LINE_WIDTH);

for (const evalSuite of suitesToRun) {
  logger.info(separator);
  const result = await evalRunner.runSuite(evalSuite);
  suiteResults.push(result);
}

logger.info(separator);
logger.info("Generating reports...");
const reportPaths = await reportGenerator.generate(suiteResults);

const totalCases = suiteResults.reduce((sum, s) => sum + s.summary.total, ZERO);
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
  totalCases > ZERO ? (totalPassed / totalCases) * PERCENT_MULTIPLIER : ZERO;

logger.info(separator);
logger.info("EVALUATION COMPLETE");
logger.info(separator);
logger.info("Summary", {
  suites: suiteResults.length,
  cases: totalCases,
  passed: totalPassed,
  failed: totalFailed,
  errors: totalErrors,
  passRate: `${passRate.toFixed(1)}%`,
});
logger.info("Reports saved", { paths: reportPaths });

if (totalFailed > ZERO || totalErrors > ZERO) {
  process.exit(1);
}

logger.info("Agent Evals completed.");
