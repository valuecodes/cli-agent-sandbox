import {
  NEGATIVE_SHARPE_PENALTY,
  NEGATIVE_SHARPE_THRESHOLD,
  SCORE_WEIGHTS,
  ZERO,
} from "../constants";
import type { ExperimentResult } from "../types/schemas";

export const computeScore = (metrics: ExperimentResult["metrics"]): number => {
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
