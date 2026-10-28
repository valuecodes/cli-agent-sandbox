import path from "node:path";

// CLI defaults
const DEFAULT_VERBOSE = false;
const DEFAULT_REPORT_FORMAT = "json" as const;
const DEFAULT_OUT_PATH = "agent-evals";
const REPORTS_SUBDIR = "reports";

// Paths
const SUITES_DIR = path.join(
  process.cwd(),
  "src",
  "cli",
  "agent-evals",
  "suites"
);
const SUITE_FILE_EXTENSION = ".json";

// Execution defaults
const DEFAULT_CASE_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TURNS = 5;

// Numeric constants
const ZERO = 0;
const PERCENT_MULTIPLIER = 100;

// Report formatting
const DECIMAL_PLACES = {
  passRate: 1,
  duration: 0,
} as const;

const LINE_WIDTH = 60;

// Status symbols for console output
const STATUS_SYMBOLS = {
  pass: "[PASS]",
  fail: "[FAIL]",
  error: "[ERROR]",
  skip: "[SKIP]",
} as const;

export {
  DECIMAL_PLACES,
  DEFAULT_CASE_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_OUT_PATH,
  DEFAULT_REPORT_FORMAT,
  DEFAULT_VERBOSE,
  LINE_WIDTH,
  PERCENT_MULTIPLIER,
  REPORTS_SUBDIR,
  STATUS_SYMBOLS,
  SUITE_FILE_EXTENSION,
  SUITES_DIR,
  ZERO,
};
