import path from "node:path";

// Output directory configuration
export const OUTPUT_BASE_DIR = "tmp/pr-comments";
export const OUTPUT_FILENAME = "all-comments.md";
export const REVIEW_COMMENTS_FILENAME = "review-comments.json";
export const CONVERSATION_COMMENTS_FILENAME = "conversation-comments.json";

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

export const getReviewCommentsPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), REVIEW_COMMENTS_FILENAME);

export const getConversationCommentsPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), CONVERSATION_COMMENTS_FILENAME);

/**
 * Codex prompt template.
 */
export const CODEX_PROMPT_TEMPLATE = (filePath: string): string =>
  `Fix the issues in this PR. Comments are in the file: ${filePath}`;
