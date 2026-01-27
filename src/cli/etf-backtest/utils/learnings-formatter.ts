import { DECIMAL_PLACES, LEARNINGS_SUMMARY_TOP_N } from "../constants";
import type { Learnings } from "../types/schemas";
import { formatFixed, formatPercent } from "./formatters";

const FEATURE_PREVIEW_COUNT = 4;
const TOP_HALF_DIVISOR = 2;
const TOP_FEATURES_COUNT = 5;
const FEATURES_TO_AVOID_COUNT = 3;

/**
 * Format learnings into a prompt-friendly text summary.
 * Returns empty string if no useful learnings exist.
 */
export const formatLearningsForPrompt = (
  learnings: Learnings | null
): string => {
  if (!learnings || learnings.history.length === 0) {
    return "";
  }

  const lines: string[] = [
    "",
    "## Previous Learnings",
    `Total iterations run: ${learnings.totalIterations}`,
  ];

  // Best result summary
  if (learnings.bestResult) {
    lines.push("");
    lines.push("**Best result so far:**");
    lines.push(`- Features: ${learnings.bestResult.featureIds.join(", ")}`);
    lines.push(
      `- Score: ${formatFixed(learnings.bestResult.score, DECIMAL_PLACES.score)}`
    );
    lines.push(
      `- R² (non-overlapping): ${formatFixed(learnings.bestResult.metrics.r2NonOverlapping, DECIMAL_PLACES.r2)}`
    );
    lines.push(
      `- Direction accuracy: ${formatPercent(learnings.bestResult.metrics.directionAccuracyNonOverlapping)}`
    );
    lines.push(`- MAE: ${formatPercent(learnings.bestResult.metrics.mae)}`);
  }

  // Top N best attempts (sorted by score)
  const sortedHistory = [...learnings.history]
    .sort((a, b) => b.score - a.score)
    .slice(0, LEARNINGS_SUMMARY_TOP_N);

  if (sortedHistory.length > 1) {
    lines.push("");
    lines.push(`**Top ${sortedHistory.length} attempts:**`);
    for (const record of sortedHistory) {
      const featurePreview = record.featureIds.slice(0, FEATURE_PREVIEW_COUNT);
      const suffix =
        record.featureIds.length > FEATURE_PREVIEW_COUNT ? "..." : "";
      lines.push(
        `- [Score ${formatFixed(record.score, DECIMAL_PLACES.score)}] ` +
          `Features: ${featurePreview.join(", ")}${suffix}`
      );
    }
  }

  // Feature frequency analysis (which features appear in best results?)
  const featureFrequency = new Map<string, number>();
  const topHalf = sortedHistory.slice(
    0,
    Math.ceil(sortedHistory.length / TOP_HALF_DIVISOR)
  );
  for (const record of topHalf) {
    for (const feature of record.featureIds) {
      featureFrequency.set(feature, (featureFrequency.get(feature) ?? 0) + 1);
    }
  }

  const frequentFeatures = [...featureFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_FEATURES_COUNT)
    .map(([feature]) => feature);

  if (frequentFeatures.length > 0) {
    lines.push("");
    lines.push(
      `**Features common in top results:** ${frequentFeatures.join(", ")}`
    );
  }

  // Identify features that consistently appear in poor results
  const bottomHalf = sortedHistory.slice(
    Math.ceil(sortedHistory.length / TOP_HALF_DIVISOR)
  );
  const poorFeatures = new Map<string, number>();
  for (const record of bottomHalf) {
    for (const feature of record.featureIds) {
      poorFeatures.set(feature, (poorFeatures.get(feature) ?? 0) + 1);
    }
  }

  // Features in bottom half but not in top half
  const toAvoid = [...poorFeatures.entries()]
    .filter(([feature]) => !featureFrequency.has(feature))
    .slice(0, FEATURES_TO_AVOID_COUNT)
    .map(([feature]) => feature);

  if (toAvoid.length > 0) {
    lines.push(`**Features to reconsider:** ${toAvoid.join(", ")}`);
  }

  lines.push("");
  lines.push(
    "Use these learnings to guide your feature selection. Try to beat the best score."
  );
  lines.push("");

  return lines.join("\n");
};
