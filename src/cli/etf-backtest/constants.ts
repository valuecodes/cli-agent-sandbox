import path from "node:path";

const DEFAULT_VERBOSE = false;
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_SEED = 42;
const DEFAULT_REFRESH = false;

// Default ISIN: iShares Core S&P 500 UCITS ETF
const DEFAULT_ISIN = "IE00B5BMR087";

// justetf.com configuration
const JUST_ETF_BASE_URL = "https://www.justetf.com";
const ETF_PROFILE_PATH = "/en/etf-profile.html";
// Match performance-chart requests with full historical data (dateFrom before 2020)
const getEtfApiPattern = (isin: string): RegExp =>
  new RegExp(`/api/etfs/${isin}/performance-chart.*dateFrom=(19|200|201)`);
const API_CAPTURE_TIMEOUT_MS = 15_000;

// localStorage key to set chart period to MAX for full historical data
const ETF_CHART_PERIOD_KEY = "etfProfileChart.defaultPeriod";
const ETF_CHART_PERIOD_VALUE = "MAX";

// Data storage paths (relative to tmp/)
const ETF_DATA_DIR = "etf-backtest";
const ETF_DATA_FILENAME = "data.json";

const MAX_NO_IMPROVEMENT = 2;
const ZERO = 0;
const MAX_TURNS_PER_ITERATION = 3;

const MIN_FEATURES = 8;
const MAX_FEATURES = 12;
const PREDICTION_HORIZON_MONTHS = 12;
const OVERLAP_PERCENT = 99;
const SAMPLES_PER_DECADE = 10;
const CI_LEVEL_PERCENT = 95;

const TARGET_R2_NON_OVERLAPPING = 0.05;
const TARGET_DIR_ACC_NON_OVERLAPPING = 0.55;
const TARGET_CALIBRATION_MIN = 0.8;
const TARGET_CALIBRATION_MAX = 1.2;

const SCORE_WEIGHTS = {
  r2NonOverlapping: 2,
  directionAccuracyNonOverlapping: 1,
  mae: -2,
} as const;

const NEGATIVE_SHARPE_THRESHOLD = 0;
const NEGATIVE_SHARPE_PENALTY = -0.5;

const CONFIDENCE_THRESHOLDS = {
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

const PERCENT_MULTIPLIER = 100;

const DECIMAL_PLACES = {
  r2: 3,
  percent: 1,
  calibration: 2,
  sharpe: 2,
  cagr: 1,
  score: 3,
} as const;

const LINE_WIDTH = 60;
const LINE_SEPARATOR = "=".repeat(LINE_WIDTH);

const NO_IMPROVEMENT_REASON = `No improvement for ${MAX_NO_IMPROVEMENT} consecutive iterations`;

const INDEX_NOT_FOUND = -1;
const JSON_SLICE_END_OFFSET = 1;

const SCRIPTS_DIR = path.join(
  process.cwd(),
  "src",
  "cli",
  "etf-backtest",
  "scripts"
);

const FEATURE_MENU = {
  momentum: ["mom_1m", "mom_3m", "mom_6m", "mom_12m"],
  trend: ["px_sma50", "px_sma200", "sma50_sma200", "dist_52w_high"],
  risk: ["vol_1m", "vol_3m", "vol_6m", "dd_current", "mdd_12m"],
  oscillators: ["rsi_14", "bb_width"],
} as const;

// Learnings configuration
const LEARNINGS_FILENAME = "learnings.json";
const MAX_HISTORY_ITEMS = 20;
const LEARNINGS_SUMMARY_TOP_N = 5;

export {
  API_CAPTURE_TIMEOUT_MS,
  CI_LEVEL_PERCENT,
  CONFIDENCE_THRESHOLDS,
  DECIMAL_PLACES,
  DEFAULT_ISIN,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_REFRESH,
  DEFAULT_SEED,
  DEFAULT_VERBOSE,
  ETF_CHART_PERIOD_KEY,
  ETF_CHART_PERIOD_VALUE,
  ETF_DATA_DIR,
  ETF_DATA_FILENAME,
  ETF_PROFILE_PATH,
  FEATURE_MENU,
  getEtfApiPattern,
  INDEX_NOT_FOUND,
  JSON_SLICE_END_OFFSET,
  JUST_ETF_BASE_URL,
  LEARNINGS_FILENAME,
  LEARNINGS_SUMMARY_TOP_N,
  LINE_SEPARATOR,
  LINE_WIDTH,
  MAX_FEATURES,
  MAX_HISTORY_ITEMS,
  MAX_NO_IMPROVEMENT,
  MAX_TURNS_PER_ITERATION,
  MIN_FEATURES,
  NEGATIVE_SHARPE_PENALTY,
  NEGATIVE_SHARPE_THRESHOLD,
  NO_IMPROVEMENT_REASON,
  OVERLAP_PERCENT,
  PERCENT_MULTIPLIER,
  PREDICTION_HORIZON_MONTHS,
  SAMPLES_PER_DECADE,
  SCORE_WEIGHTS,
  SCRIPTS_DIR,
  TARGET_CALIBRATION_MAX,
  TARGET_CALIBRATION_MIN,
  TARGET_DIR_ACC_NON_OVERLAPPING,
  TARGET_R2_NON_OVERLAPPING,
  ZERO,
};
