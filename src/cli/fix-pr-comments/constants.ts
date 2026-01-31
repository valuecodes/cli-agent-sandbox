import path from "node:path";

// Output directory configuration
export const OUTPUT_BASE_DIR = path.join("tmp", "pr-comments");
export const OUTPUT_FILENAME = "all-comments.md";
export const REVIEW_COMMENTS_FILENAME = "review-comments.json";
export const CONVERSATION_COMMENTS_FILENAME = "conversation-comments.json";
export const ANSWERS_FILENAME = "answers.json";

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

export const getAnswersPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), ANSWERS_FILENAME);

/**
 * Codex prompt template.
 */
export const CODEX_PROMPT_TEMPLATE = (
  commentsPath: string,
  answersPath: string
): string =>
  `Fix the issues mentioned in the PR comments.

Comments file: ${commentsPath}

After fixing each issue, write a JSON file to: ${answersPath}

The JSON should be an array of objects:
[
  {
    "commentId": <number from the review-comments.json id field>,
    "fixed": <true if fixed, false if not>
  }
]

Include an entry for each comment.`;
