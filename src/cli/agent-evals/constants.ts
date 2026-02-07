import path from "node:path";

// CLI defaults
export const DEFAULT_VERBOSE = false;
export const DEFAULT_REPORT_FORMAT = "json" as const;
export const DEFAULT_OUT_PATH = "agent-evals";
export const REPORTS_SUBDIR = "reports";

// Paths
export const SUITES_DIR = path.join(
  process.cwd(),
  "src",
  "cli",
  "agent-evals",
  "suites"
);
export const SUITE_FILE_EXTENSION = ".json";

// Comparison mode
export const MIN_COMPARE_MODELS = 2;
export const COMPARISON_REPORTS_SUBDIR = "comparison-reports";

// Execution defaults
export const DEFAULT_CASE_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_TURNS = 5;

// Numeric constants
export const ZERO = 0;
export const ONE = 1;
export const PERCENT_MULTIPLIER = 100;

// Report formatting
export const DECIMAL_PLACES = {
  passRate: 1,
  duration: 0,
} as const;

export const LINE_WIDTH = 60;

// Status symbols for console output
export const STATUS_SYMBOLS = {
  pass: "[PASS]",
  fail: "[FAIL]",
  error: "[ERROR]",
  skip: "[SKIP]",
} as const;
