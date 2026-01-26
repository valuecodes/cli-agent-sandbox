// pnpm run:etf-backtest

// Iterative ETF feature selection optimization agent
// Runs experiments with different feature combinations and finds the best set

import "dotenv/config";

import { AgentRunner } from "~clients/agent-runner";
import { Logger } from "~clients/logger";
import { createRunPythonTool } from "~tools/run-python/run-python-tool";
import { parseArgs } from "~utils/parse-args";

import {
  DECIMAL_PLACES,
  FEATURE_MENU,
  MAX_FEATURES,
  MAX_NO_IMPROVEMENT,
  MAX_TURNS_PER_ITERATION,
  MIN_FEATURES,
  NO_IMPROVEMENT_REASON,
  OVERLAP_PERCENT,
  PREDICTION_HORIZON_MONTHS,
  REASONING_PREVIEW_LIMIT,
  SAMPLES_PER_DECADE,
  SCRIPTS_DIR,
  TARGET_CALIBRATION_MAX,
  TARGET_CALIBRATION_MIN,
  TARGET_DIR_ACC_NON_OVERLAPPING,
  TARGET_R2_NON_OVERLAPPING,
  ZERO,
} from "./constants";
import { AgentOutputSchema, CliArgsSchema } from "./schemas";
import type { ExperimentResult } from "./schemas";
import { extractLastExperimentResult } from "./utils/experiment-extract";
import { printFinalResults } from "./utils/final-report";
import { formatFixed, formatPercent } from "./utils/formatters";
import { computeScore } from "./utils/scoring";

const logger = new Logger();

// --- Parse CLI arguments ---
const { verbose, ticker, maxIterations, seed } = parseArgs({
  logger,
  schema: CliArgsSchema,
});

// --- Build agent instructions ---
const buildInstructions = () => `
You are an ETF feature selection optimization agent. Your goal is to find features that produce **accurate ${PREDICTION_HORIZON_MONTHS}-month return predictions**, not optimal trading strategies.

## Important Distinction
- **Prediction accuracy** (R², direction accuracy, MAE) = Can we forecast the ${PREDICTION_HORIZON_MONTHS}-month return?
- **Trading performance** (Sharpe, drawdown) = Is this a good trading strategy?

You are optimizing for PREDICTION ACCURACY. Trading metrics are informational only.

## Feature Menu
Choose ${MIN_FEATURES}-${MAX_FEATURES} features from the following categories:

**Momentum (price-based returns over periods):**
${FEATURE_MENU.momentum.map((f) => `- ${f}`).join("\n")}

**Trend (price relative to moving averages):**
${FEATURE_MENU.trend.map((f) => `- ${f}`).join("\n")}

**Risk (volatility and drawdown measures):**
${FEATURE_MENU.risk.map((f) => `- ${f}`).join("\n")}

**Oscillators (optional, technical indicators):**
${FEATURE_MENU.oscillators.map((f) => `- ${f}`).join("\n")}

## Metrics Priority (most to least important)
1. **r2NonOverlapping** - R² on non-overlapping ${PREDICTION_HORIZON_MONTHS}-month windows (honest assessment). Target > ${TARGET_R2_NON_OVERLAPPING}
2. **directionAccuracyNonOverlapping** - Did we predict the sign correctly? Target > ${formatPercent(
  TARGET_DIR_ACC_NON_OVERLAPPING
)}
3. **mae** - Mean absolute error of predictions. Lower is better
4. **calibrationRatio** - Is predicted magnitude realistic? Target ${TARGET_CALIBRATION_MIN}-${TARGET_CALIBRATION_MAX}

## Non-Overlapping vs Overlapping Metrics
- **Non-overlapping metrics** use truly independent ${PREDICTION_HORIZON_MONTHS}-month periods (~${SAMPLES_PER_DECADE} samples per decade)
- **Overlapping metrics** use all data but windows overlap ${OVERLAP_PERCENT}%, inflating apparent performance
- Focus on NON-OVERLAPPING metrics for realistic assessment

## Backtest Metrics (informational only)
- Sharpe ratio: If negative, features may be problematic (sanity check)
- Max drawdown: Not an optimization target

## Feature Selection Guidelines
For ${PREDICTION_HORIZON_MONTHS}-month predictions:
- **Momentum features** (mom_*) capture recent trends but may mean-revert over ${PREDICTION_HORIZON_MONTHS} months
- **Trend features** (px_sma*, sma50_sma200) show long-term direction
- **Risk features** (vol_*, dd_*, mdd_*) capture volatility regimes

Be skeptical of high R² values - with overlapping windows, apparent fit is inflated.
Focus on features with economic intuition for ${PREDICTION_HORIZON_MONTHS}-month horizons.

## Tool Usage
IMPORTANT: Run exactly ONE experiment per turn. Do not run multiple experiments.

Call runPython with:
- scriptName: "run_experiment.py"
- input: { "ticker": "<ticker>", "featureIds": [...], "seed": <seed> }

After you receive results, respond with your analysis. Do not call runPython again in the same turn.

## Response Format
After each experiment, respond with JSON (do not call any more tools):
{
  "status": "continue" | "final",
  "selectedFeatures": ["feature1", "feature2", ...],
  "reasoning": "Explain your analysis focusing on prediction accuracy",
  "stopReason": "Explain why stopping if final, otherwise null"
}
`;

// --- Run iterative optimization ---
const runAgentOptimization = async () => {
  const runPythonTool = createRunPythonTool({
    scriptsDir: SCRIPTS_DIR,
    logger,
  });

  const agentRunner = new AgentRunner({
    name: "EtfFeatureOptimizer",
    model: "gpt-5-mini",
    tools: [runPythonTool],
    outputType: AgentOutputSchema,
    instructions: buildInstructions(),
    logger,
    logToolResults: verbose,
  });

  // Track state
  let bestResult: ExperimentResult | null = null;
  let bestIteration = ZERO;
  let bestScore = Number.NEGATIVE_INFINITY;
  let noImprovementCount = ZERO;
  let iteration = ZERO;
  let stopReason = "Max iterations reached";

  // Initial prompt
  let currentPrompt = `
Start feature selection optimization for ${ticker}.

Begin by selecting ${MIN_FEATURES}-${MAX_FEATURES} features that you think will best predict ${PREDICTION_HORIZON_MONTHS}-month returns.
Consider using a mix from each category (momentum, trend, risk).

Use runPython with:
- scriptName: "run_experiment.py"
- input: { "ticker": "${ticker}", "featureIds": [...your features...], "seed": ${seed} }

After running the experiment, analyze the results and decide whether to continue or stop.
`;

  while (iteration < maxIterations) {
    iteration++;
    logger.info("\n--- Iteration ---", { iteration, maxIterations });

    let runResult;
    try {
      runResult = await agentRunner.run({
        prompt: currentPrompt,
        maxTurns: MAX_TURNS_PER_ITERATION, // Limit turns per iteration: 1 tool call + 1 result + 1 output
      });
    } catch (err) {
      // Handle MaxTurnsExceededError - try to extract result from partial state
      if (
        err &&
        typeof err === "object" &&
        "state" in err &&
        err.state &&
        typeof err.state === "object" &&
        "_newItems" in err.state
      ) {
        logger.warn("Agent exceeded turn limit, extracting partial results...");
        const state = err.state as {
          _newItems?: { type: string; output?: unknown }[];
        };
        const partialResult = extractLastExperimentResult({
          newItems: state._newItems,
        });
        if (partialResult) {
          const score = computeScore(partialResult.metrics);
          if (score > bestScore) {
            bestScore = score;
            bestResult = partialResult;
            bestIteration = iteration;
          }
        }
        currentPrompt =
          "You ran too many experiments in one turn. Please run exactly ONE experiment, then respond with your JSON analysis.";
        continue;
      }
      throw err;
    }
    const parseResult = AgentOutputSchema.safeParse(runResult.finalOutput);

    if (!parseResult.success) {
      logger.warn("Invalid agent response format, continuing...");
      if (verbose) {
        logger.debug("Parse error", { error: parseResult.error });
      }
      currentPrompt =
        "Your response was not valid JSON. Please respond with the correct format.";
      continue;
    }

    const output = parseResult.data;
    logger.info("Features selected", { features: output.selectedFeatures });
    logger.info("Reasoning preview", {
      preview: output.reasoning.substring(ZERO, REASONING_PREVIEW_LIMIT),
    });

    // Try to extract experiment result from the tool call outputs
    const lastToolResult = extractLastExperimentResult(runResult);

    if (lastToolResult) {
      const score = computeScore(lastToolResult.metrics);
      logger.info("Prediction metrics", {
        r2NonOverlapping: formatFixed(
          lastToolResult.metrics.r2NonOverlapping,
          DECIMAL_PLACES.r2
        ),
        directionAccuracyNonOverlapping: formatPercent(
          lastToolResult.metrics.directionAccuracyNonOverlapping
        ),
        mae: formatPercent(lastToolResult.metrics.mae),
        score: formatFixed(score, DECIMAL_PLACES.score),
      });
      if (verbose) {
        logger.debug("Backtest metrics", {
          sharpe: formatFixed(
            lastToolResult.metrics.sharpe,
            DECIMAL_PLACES.sharpe
          ),
          maxDrawdown: formatPercent(lastToolResult.metrics.maxDrawdown),
        });
      }

      if (score > bestScore) {
        bestScore = score;
        bestResult = lastToolResult;
        bestIteration = iteration;
        noImprovementCount = ZERO;
        logger.info("New best result!");
      } else {
        noImprovementCount++;
        logger.info("No improvement", {
          noImprovementCount,
          maxNoImprovement: MAX_NO_IMPROVEMENT,
        });
      }
    }

    // Check stop conditions
    if (output.status === "final") {
      stopReason = output.stopReason ?? "Agent decided to stop";
      logger.info("Agent stopped", { stopReason });
      break;
    }

    if (noImprovementCount >= MAX_NO_IMPROVEMENT) {
      stopReason = NO_IMPROVEMENT_REASON;
      logger.info(stopReason);
      break;
    }

    // Build next prompt
    currentPrompt = `
Your previous experiment is complete. Results are in your conversation history.
You have ${maxIterations - iteration} iterations remaining.

Based on the metrics, decide:
- If you want to try different features, select them and run another experiment
- If you think you've found a good set, respond with status "final"

Focus on: Higher r2NonOverlapping, higher directionAccuracyNonOverlapping, lower MAE.
Backtest metrics (Sharpe, drawdown) are informational only.
`;
  }

  // Output final results
  if (bestResult) {
    printFinalResults(logger, bestResult, bestIteration, iteration, stopReason);
  } else {
    logger.warn("No successful experiments completed.");
  }
};

// --- Main ---
logger.info("ETF Backtest Feature Optimization starting...");
if (verbose) {
  logger.debug("Verbose mode enabled");
}

await runAgentOptimization();

logger.info("\nETF Backtest completed.");
