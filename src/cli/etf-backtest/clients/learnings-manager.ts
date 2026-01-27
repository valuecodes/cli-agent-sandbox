import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForRead, resolveTmpPathForWrite } from "~tools/utils/fs";

import {
  ETF_DATA_DIR,
  LEARNINGS_FILENAME,
  MAX_HISTORY_ITEMS,
} from "../constants";
import type { ExperimentResult, IterationRecord, Learnings } from "../schemas";
import { LearningsSchema } from "../schemas";
import { computeScore } from "../utils/scoring";

export type LearningsManagerConfig = {
  logger: Logger;
};

/**
 * Manages learnings persistence for ETF backtest optimization.
 * Stores iteration history and best results per ISIN.
 */
export class LearningsManager {
  private logger: Logger;

  constructor(config: LearningsManagerConfig) {
    this.logger = config.logger;
  }

  /**
   * Build the relative path for learnings file (relative to tmp/).
   */
  private getLearningsPath(isin: string): string {
    return path.join(ETF_DATA_DIR, isin, LEARNINGS_FILENAME);
  }

  /**
   * Load existing learnings from disk.
   * Returns null if no learnings exist.
   */
  async load(isin: string): Promise<Learnings | null> {
    try {
      const learningsPath = await resolveTmpPathForRead(
        this.getLearningsPath(isin)
      );
      const content = await fs.readFile(learningsPath, "utf8");
      const json = JSON.parse(content) as unknown;
      const validated = LearningsSchema.parse(json);
      this.logger.info("Loaded existing learnings", {
        isin,
        totalIterations: validated.totalIterations,
        historyCount: validated.history.length,
      });
      return validated;
    } catch {
      this.logger.info("No existing learnings found", { isin });
      return null;
    }
  }

  /**
   * Create initial learnings structure for a new ISIN.
   */
  createInitial(isin: string): Learnings {
    const now = new Date().toISOString();
    return {
      isin,
      createdAt: now,
      updatedAt: now,
      totalIterations: 0,
      bestResult: null,
      history: [],
    };
  }

  /**
   * Add an iteration result to learnings.
   * Updates bestResult if this iteration is better.
   */
  addIteration(
    learnings: Learnings,
    iteration: number,
    result: ExperimentResult
  ): Learnings {
    const score = computeScore(result.metrics);
    const isBest =
      learnings.bestResult === null || score > learnings.bestResult.score;

    const record: IterationRecord = {
      iteration: learnings.totalIterations + iteration,
      timestamp: new Date().toISOString(),
      featureIds: result.featureIds,
      score,
      metrics: {
        r2NonOverlapping: result.metrics.r2NonOverlapping,
        directionAccuracyNonOverlapping:
          result.metrics.directionAccuracyNonOverlapping,
        mae: result.metrics.mae,
        sharpe: result.metrics.sharpe,
      },
      wasBest: isBest,
    };

    // Update history, trimming to max size (keep most recent)
    const newHistory = [...learnings.history, record];
    if (newHistory.length > MAX_HISTORY_ITEMS) {
      newHistory.shift();
    }

    const updatedLearnings: Learnings = {
      ...learnings,
      updatedAt: new Date().toISOString(),
      history: newHistory,
    };

    // Update best result if this is better
    if (isBest) {
      updatedLearnings.bestResult = {
        iteration: record.iteration,
        featureIds: result.featureIds,
        score,
        metrics: record.metrics,
      };
    }

    return updatedLearnings;
  }

  /**
   * Increment total iterations counter (called at end of run).
   */
  finishRun(learnings: Learnings, iterationsCompleted: number): Learnings {
    return {
      ...learnings,
      totalIterations: learnings.totalIterations + iterationsCompleted,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Save learnings to disk.
   */
  async save(isin: string, learnings: Learnings): Promise<void> {
    const learningsPath = await resolveTmpPathForWrite(
      this.getLearningsPath(isin)
    );
    await fs.writeFile(
      learningsPath,
      JSON.stringify(learnings, null, 2),
      "utf8"
    );
    this.logger.debug("Saved learnings", { isin, path: learningsPath });
  }
}
