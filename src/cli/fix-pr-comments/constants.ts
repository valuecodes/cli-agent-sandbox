import path from "node:path";

// Output directory configuration
export const OUTPUT_BASE_DIR = "tmp/pr-comments";
export const OUTPUT_FILENAME = "all-comments.md";

/**
 * Build the output directory path for a given PR number.
 */
export const getOutputDir = (prNumber: number): string =>
  path.join(process.cwd(), OUTPUT_BASE_DIR, `pr-${prNumber}`);

/**
 * Build the full output file path for a given PR number.
 */
export const getOutputPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), OUTPUT_FILENAME);

/**
 * Codex prompt template.
 */
export const CODEX_PROMPT_TEMPLATE = (filePath: string): string =>
  `Fix the issues in this PR. Comments are in the file: ${filePath}`;
