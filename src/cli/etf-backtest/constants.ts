import path from "node:path";

export const DEFAULT_VERBOSE = false;
export const DEFAULT_TICKER = "SPY";
export const DEFAULT_MAX_ITERATIONS = 5;
export const DEFAULT_SEED = 42;

export const MAX_NO_IMPROVEMENT = 2;
export const ZERO = 0;
export const MAX_TURNS_PER_ITERATION = 3;
export const REASONING_PREVIEW_LIMIT = 100;

export const MIN_FEATURES = 8;
export const MAX_FEATURES = 12;
export const PREDICTION_HORIZON_MONTHS = 12;
export const OVERLAP_PERCENT = 99;
export const SAMPLES_PER_DECADE = 10;
export const CI_LEVEL_PERCENT = 95;

export const TARGET_R2_NON_OVERLAPPING = 0.05;
export const TARGET_DIR_ACC_NON_OVERLAPPING = 0.55;
export const TARGET_CALIBRATION_MIN = 0.8;
export const TARGET_CALIBRATION_MAX = 1.2;

export const SCORE_WEIGHTS = {
  r2NonOverlapping: 2,
  directionAccuracyNonOverlapping: 1,
  mae: -2,
} as const;

export const NEGATIVE_SHARPE_THRESHOLD = 0;
export const NEGATIVE_SHARPE_PENALTY = -0.5;

export const CONFIDENCE_THRESHOLDS = {
  moderate: {
    r2NonOverlapping: 0.03,
    directionAccuracyNonOverlapping: 0.5,
    maxCiWidth: 0.5,
  },
  reasonable: {
    r2NonOverlapping: 0.08,
    directionAccuracyNonOverlapping: 0.6,
    maxCiWidth: 0.4,
  },
} as const;

export const PERCENT_MULTIPLIER = 100;

export const DECIMAL_PLACES = {
  r2: 3,
  percent: 1,
  calibration: 2,
  sharpe: 2,
  cagr: 1,
  score: 3,
} as const;

export const LINE_WIDTH = 60;
export const LINE_SEPARATOR = "=".repeat(LINE_WIDTH);

export const NO_IMPROVEMENT_REASON = `No improvement for ${MAX_NO_IMPROVEMENT} consecutive iterations`;

export const INDEX_NOT_FOUND = -1;
export const JSON_SLICE_END_OFFSET = 1;

export const SCRIPTS_DIR = path.join(
  process.cwd(),
  "src",
  "cli",
  "etf-backtest",
  "scripts"
);

export const FEATURE_MENU = {
  momentum: ["mom_1m", "mom_3m", "mom_6m", "mom_12m"],
  trend: ["px_sma50", "px_sma200", "sma50_sma200", "dist_52w_high"],
  risk: ["vol_1m", "vol_3m", "vol_6m", "dd_current", "mdd_12m"],
  oscillators: ["rsi_14", "bb_width"],
} as const;
