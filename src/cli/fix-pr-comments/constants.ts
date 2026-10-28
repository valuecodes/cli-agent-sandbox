import path from "node:path";

// Output directory configuration
const OUTPUT_BASE_DIR = path.join("tmp", "pr-comments");
const OUTPUT_FILENAME = "all-comments.md";
const REVIEW_COMMENTS_FILENAME = "review-comments.json";
const CONVERSATION_COMMENTS_FILENAME = "conversation-comments.json";
const ANSWERS_FILENAME = "answers.json";

/**
 * Build the output directory path for a given PR number.
 */
const getOutputDir = (prNumber: number): string =>
  path.join(process.cwd(), OUTPUT_BASE_DIR, `pr-${prNumber}`);

/**
 * Build the full output file path for a given PR number.
 */
const getOutputPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), OUTPUT_FILENAME);

const getReviewCommentsPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), REVIEW_COMMENTS_FILENAME);

const getConversationCommentsPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), CONVERSATION_COMMENTS_FILENAME);

const getAnswersPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), ANSWERS_FILENAME);

/**
 * Codex prompt template.
 */
const CODEX_PROMPT_TEMPLATE = (
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

export {
  ANSWERS_FILENAME,
  CODEX_PROMPT_TEMPLATE,
  CONVERSATION_COMMENTS_FILENAME,
  OUTPUT_BASE_DIR,
  OUTPUT_FILENAME,
  REVIEW_COMMENTS_FILENAME,
  getAnswersPath,
  getConversationCommentsPath,
  getOutputDir,
  getOutputPath,
  getReviewCommentsPath,
};
