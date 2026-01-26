import { z } from "zod";

import {
  DEFAULT_ISIN,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_REFRESH,
  DEFAULT_SEED,
  DEFAULT_VERBOSE,
} from "./constants";

// ISIN validation: 2 letter country code + 10 alphanumeric characters
const IsinSchema = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]{10}$/, "Invalid ISIN format");

export const CliArgsSchema = z.object({
  verbose: z.coerce.boolean().default(DEFAULT_VERBOSE),
  isin: IsinSchema.default(DEFAULT_ISIN),
  refresh: z.coerce.boolean().default(DEFAULT_REFRESH),
  maxIterations: z.coerce.number().default(DEFAULT_MAX_ITERATIONS),
  seed: z.coerce.number().default(DEFAULT_SEED),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

export const AgentOutputSchema = z.object({
  status: z.enum(["continue", "final"]),
  selectedFeatures: z.array(z.string()),
  reasoning: z.string(),
  stopReason: z.string().nullable(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const ExperimentResultSchema = z.object({
  featureIds: z.array(z.string()),
  metrics: z.object({
    // Backtest metrics (informational)
    sharpe: z.number(),
    maxDrawdown: z.number(),
    cagr: z.number(),
    // Prediction metrics (overlapping)
    r2: z.number(),
    mse: z.number(),
    directionAccuracy: z.number(),
    mae: z.number(),
    calibrationRatio: z.number(),
    // Non-overlapping metrics (honest assessment)
    r2NonOverlapping: z.number(),
    directionAccuracyNonOverlapping: z.number(),
  }),
  prediction: z.object({
    pred12mReturn: z.number(),
    ci95Low: z.number(),
    ci95High: z.number(),
    uncertainty: z.object({
      baseStd: z.number(),
      adjustedStd: z.number(),
      extrapolationMultiplier: z.number(),
      isExtrapolating: z.boolean(),
    }),
  }),
  modelInfo: z.object({
    trainSamples: z.number(),
    valSamples: z.number(),
    testSamples: z.number(),
  }),
  dataInfo: z.object({
    totalSamples: z.number(),
    nonOverlappingSamples: z.number(),
    effectiveIndependentPeriods: z.number(),
  }),
});

export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
