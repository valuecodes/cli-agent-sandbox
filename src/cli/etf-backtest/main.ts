// pnpm run:etf-backtest

// Iterative ETF feature selection optimization agent
// Runs experiments with different feature combinations and finds the best set

import "dotenv/config";

import { Agent, MemorySession, Runner } from "@openai/agents";
import { Logger } from "~clients/logger";
import { createRunPythonTool } from "~tools/run-python/run-python-tool";
import { parseArgs } from "~utils/parse-args";

import {
  AGENT_NAME,
  CI_LEVEL_PERCENT,
  CONFIDENCE_THRESHOLDS,
  DECIMAL_PLACES,
  FEATURE_MENU,
  INDEX_NOT_FOUND,
  JSON_SLICE_END_OFFSET,
  LINE_SEPARATOR,
  MAX_FEATURES,
  MAX_NO_IMPROVEMENT,
  MAX_TURNS_PER_ITERATION,
  MIN_FEATURES,
  MODEL_NAME,
  NEGATIVE_SHARPE_PENALTY,
  NEGATIVE_SHARPE_THRESHOLD,
  NO_IMPROVEMENT_REASON,
  OVERLAP_PERCENT,
  PERCENT_MULTIPLIER,
  PREDICTION_HORIZON_MONTHS,
  PYTHON_BINARY,
  REASONING_PREVIEW_LIMIT,
  SAMPLES_PER_DECADE,
  SCORE_WEIGHTS,
  SCRIPTS_DIR,
  TARGET_CALIBRATION_MAX,
  TARGET_CALIBRATION_MIN,
  TARGET_DIR_ACC_NON_OVERLAPPING,
  TARGET_R2_NON_OVERLAPPING,
  TOOL_RESULT_PREVIEW_LIMIT,
  ZERO,
} from "./constants";
import {
  AgentOutputSchema,
  CliArgsSchema,
  ExperimentResultSchema,
} from "./schemas";
import type { ExperimentResult } from "./schemas";

const logger = new Logger();

// --- Parse CLI arguments ---
const { verbose, ticker, maxIterations, seed } = parseArgs({
  logger,
  schema: CliArgsSchema,
});

const formatPercent = (
  value: number,
  decimals = DECIMAL_PLACES.percent
): string => `${(value * PERCENT_MULTIPLIER).toFixed(decimals)}%`;

const formatFixed = (value: number, decimals: number): string =>
  value.toFixed(decimals);

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

// --- Compute improvement score ---
const computeScore = (metrics: ExperimentResult["metrics"]): number => {
  // Primary: prediction accuracy on non-overlapping samples (honest assessment)
  // Secondary: Sharpe < 0 is a red flag (sanity check only)
  return (
    metrics.r2NonOverlapping * SCORE_WEIGHTS.r2NonOverlapping +
    metrics.directionAccuracyNonOverlapping *
      SCORE_WEIGHTS.directionAccuracyNonOverlapping +
    metrics.mae * SCORE_WEIGHTS.mae +
    (metrics.sharpe < NEGATIVE_SHARPE_THRESHOLD
      ? NEGATIVE_SHARPE_PENALTY
      : ZERO)
  );
};

// --- Print final results ---
const printFinalResults = (
  bestResult: ExperimentResult,
  bestIteration: number,
  totalIterations: number,
  stopReason: string
) => {
  // Confidence note based on non-overlapping metrics
  const ciWidth =
    bestResult.prediction.ci95High - bestResult.prediction.ci95Low;
  let confidence = "LOW";
  if (
    bestResult.metrics.r2NonOverlapping >
      CONFIDENCE_THRESHOLDS.moderate.r2NonOverlapping &&
    bestResult.metrics.directionAccuracyNonOverlapping >
      CONFIDENCE_THRESHOLDS.moderate.directionAccuracyNonOverlapping &&
    ciWidth < CONFIDENCE_THRESHOLDS.moderate.maxCiWidth
  ) {
    confidence = "MODERATE";
  }
  if (
    bestResult.metrics.r2NonOverlapping >
      CONFIDENCE_THRESHOLDS.reasonable.r2NonOverlapping &&
    bestResult.metrics.directionAccuracyNonOverlapping >
      CONFIDENCE_THRESHOLDS.reasonable.directionAccuracyNonOverlapping &&
    ciWidth < CONFIDENCE_THRESHOLDS.reasonable.maxCiWidth
  ) {
    confidence = "REASONABLE";
  }

  const lines = [
    "",
    LINE_SEPARATOR,
    "OPTIMIZATION COMPLETE",
    LINE_SEPARATOR,
    `Iterations: ${totalIterations}`,
    `Best iteration: ${bestIteration}`,
    `Stop reason: ${stopReason}`,
    "",
    "Best Feature Set:",
    ...bestResult.featureIds.map((feature) => `  - ${feature}`),
    "",
    "Prediction Accuracy (Non-Overlapping - Honest Assessment):",
    `  R²:                ${formatFixed(
      bestResult.metrics.r2NonOverlapping,
      DECIMAL_PLACES.r2
    )}`,
    `  Direction Accuracy: ${formatPercent(
      bestResult.metrics.directionAccuracyNonOverlapping
    )}`,
    `  Independent Samples: ${bestResult.dataInfo.nonOverlappingSamples}`,
    "",
    "Prediction Accuracy (Overlapping - Inflated):",
    `  R²:                ${formatFixed(
      bestResult.metrics.r2,
      DECIMAL_PLACES.r2
    )}`,
    `  Direction Accuracy: ${formatPercent(
      bestResult.metrics.directionAccuracy
    )}`,
    `  MAE:               ${formatPercent(bestResult.metrics.mae)}`,
    `  Calibration:       ${formatFixed(
      bestResult.metrics.calibrationRatio,
      DECIMAL_PLACES.calibration
    )}`,
    "",
    "Backtest Metrics (Informational):",
    `  Sharpe Ratio:   ${formatFixed(
      bestResult.metrics.sharpe,
      DECIMAL_PLACES.sharpe
    )}`,
    `  Max Drawdown:   ${formatPercent(bestResult.metrics.maxDrawdown)}`,
    `  CAGR:           ${formatPercent(
      bestResult.metrics.cagr,
      DECIMAL_PLACES.cagr
    )}`,
    "",
    `${PREDICTION_HORIZON_MONTHS}-Month Prediction:`,
    `  Expected Return: ${formatPercent(bestResult.prediction.pred12mReturn)}`,
    `  ${CI_LEVEL_PERCENT}% CI:          [${formatPercent(
      bestResult.prediction.ci95Low
    )}, ${formatPercent(bestResult.prediction.ci95High)}]`,
    "",
    "Uncertainty Details:",
    `  Base Std:        ${formatPercent(
      bestResult.prediction.uncertainty.baseStd
    )}`,
    `  Adjusted Std:    ${formatPercent(
      bestResult.prediction.uncertainty.adjustedStd
    )}`,
    `  Extrapolation:   ${
      bestResult.prediction.uncertainty.isExtrapolating
        ? "Yes (features outside training range)"
        : "No"
    }`,
    "",
    `Confidence: ${confidence}`,
    `Note: Non-overlapping metrics use only ${bestResult.dataInfo.nonOverlappingSamples} independent periods.`,
    "Past performance does not guarantee future results.",
    LINE_SEPARATOR,
  ];

  logger.info(lines.join("\n"));
};

// --- Run iterative optimization ---
const runOptimization = async () => {
  const runPythonTool = createRunPythonTool({
    scriptsDir: SCRIPTS_DIR,
    logger,
    pythonBinary: PYTHON_BINARY,
  });

  const agent = new Agent({
    name: AGENT_NAME,
    model: MODEL_NAME,
    tools: [runPythonTool],
    outputType: AgentOutputSchema,
    instructions: buildInstructions(),
  });

  const runner = new Runner();
  const session = new MemorySession();

  // Tool logging
  const toolsInProgress = new Set<string>();
  runner.on("agent_tool_start", (_context, _agent, tool, details) => {
    const toolCall = details.toolCall as Record<string, unknown>;
    const callId = toolCall.id as string;
    if (toolsInProgress.has(callId)) {
      return;
    }
    toolsInProgress.add(callId);
    logger.tool(`Calling ${tool.name}`);
  });
  runner.on("agent_tool_end", (_context, _agent, tool, result) => {
    logger.tool(`${tool.name} completed`);
    if (verbose) {
      const preview =
        result.length > TOOL_RESULT_PREVIEW_LIMIT
          ? result.substring(ZERO, TOOL_RESULT_PREVIEW_LIMIT) + "..."
          : result;
      logger.debug(`Result: ${preview}`);
    }
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
    logger.info(`\n--- Iteration ${iteration}/${maxIterations} ---`);

    let runResult;
    try {
      runResult = await runner.run(agent, currentPrompt, {
        session,
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
        logger.debug(`Parse error: ${JSON.stringify(parseResult.error)}`);
      }
      currentPrompt =
        "Your response was not valid JSON. Please respond with the correct format.";
      continue;
    }

    const output = parseResult.data;
    logger.info(`Features: ${output.selectedFeatures.join(", ")}`);
    logger.info(
      `Reasoning: ${output.reasoning.substring(ZERO, REASONING_PREVIEW_LIMIT)}...`
    );

    // Try to extract experiment result from the tool call outputs
    const lastToolResult = extractLastExperimentResult(runResult);

    if (lastToolResult) {
      const score = computeScore(lastToolResult.metrics);
      logger.info(
        `Prediction: R²_no=${formatFixed(
          lastToolResult.metrics.r2NonOverlapping,
          DECIMAL_PLACES.r2
        )}, ` +
          `DirAcc_no=${formatPercent(
            lastToolResult.metrics.directionAccuracyNonOverlapping
          )}, ` +
          `MAE=${formatPercent(
            lastToolResult.metrics.mae
          )}, Score=${formatFixed(score, DECIMAL_PLACES.score)}`
      );
      if (verbose) {
        logger.debug(
          `Backtest: Sharpe=${formatFixed(
            lastToolResult.metrics.sharpe,
            DECIMAL_PLACES.sharpe
          )}, ` + `MaxDD=${formatPercent(lastToolResult.metrics.maxDrawdown)}`
        );
      }

      if (score > bestScore) {
        bestScore = score;
        bestResult = lastToolResult;
        bestIteration = iteration;
        noImprovementCount = ZERO;
        logger.info("New best result!");
      } else {
        noImprovementCount++;
        logger.info(
          `No improvement (${noImprovementCount}/${MAX_NO_IMPROVEMENT})`
        );
      }
    }

    // Check stop conditions
    if (output.status === "final") {
      stopReason = output.stopReason ?? "Agent decided to stop";
      logger.info(`Agent stopped: ${stopReason}`);
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
    printFinalResults(bestResult, bestIteration, iteration, stopReason);
  } else {
    logger.warn("No successful experiments completed.");
  }
};

// Extract JSON object from stdout which may contain other output before/after
const extractJsonFromStdout = (stdout: string): unknown => {
  // Find the first '{' and match to its closing '}'
  const startIdx = stdout.indexOf("{");
  if (startIdx === INDEX_NOT_FOUND) {
    return null;
  }

  let braceCount = ZERO;
  let endIdx = INDEX_NOT_FOUND;
  for (let i = startIdx; i < stdout.length; i++) {
    if (stdout[i] === "{") {
      braceCount++;
    }
    if (stdout[i] === "}") {
      braceCount--;
    }
    if (braceCount === ZERO) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === INDEX_NOT_FOUND) {
    return null;
  }

  const jsonStr = stdout.slice(startIdx, endIdx + JSON_SLICE_END_OFFSET);
  return JSON.parse(jsonStr);
};

// Helper to extract experiment result from runner result
const extractLastExperimentResult = (runResult: {
  newItems?: { type: string; output?: unknown }[];
}): ExperimentResult | null => {
  try {
    // Look through the newItems for tool call outputs
    const items = runResult.newItems ?? [];
    for (const item of items) {
      if (item.type === "tool_call_output_item" && item.output) {
        const output = item.output;
        // Output may be a string (JSON) or already parsed object
        let parsed: unknown;
        if (typeof output === "string") {
          parsed = JSON.parse(output);
        } else {
          parsed = output;
        }

        // The Python tool returns { success, exitCode, stdout, stderr }
        const toolResult = parsed as { stdout?: string };
        if (toolResult.stdout) {
          // Extract JSON from stdout which may contain training output before the result
          const result = extractJsonFromStdout(toolResult.stdout);
          if (result) {
            const validated = ExperimentResultSchema.safeParse(result);
            if (validated.success) {
              return validated.data;
            }
          }
        }
      }
    }
  } catch {
    // Parsing failed, return null
  }
  return null;
};

// --- Main ---
logger.info("ETF Backtest Feature Optimization starting...");
if (verbose) {
  logger.debug("Verbose mode enabled");
}

await runOptimization();

logger.info("\nETF Backtest completed.");
