import type { Logger } from "~clients/logger";

import {
  CI_LEVEL_PERCENT,
  CONFIDENCE_THRESHOLDS,
  DECIMAL_PLACES,
  LINE_SEPARATOR,
  PREDICTION_HORIZON_MONTHS,
} from "../constants";
import type { ExperimentResult } from "../types/schemas";
import { formatFixed, formatPercent } from "./formatters";

export const printFinalResults = (
  logger: Logger,
  bestResult: ExperimentResult,
  bestIteration: number,
  totalIterations: number,
  stopReason: string
) => {
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

  logger.answer(lines.join("\n"));
};
