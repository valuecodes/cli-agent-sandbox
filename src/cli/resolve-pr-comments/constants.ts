import path from "node:path";

export const OUTPUT_BASE_DIR = path.join("tmp", "resolve-pr-comments");

export const getOutputDir = (prNumber: number): string =>
  path.join(process.cwd(), OUTPUT_BASE_DIR, `pr-${prNumber}`);

export const getAnalysisPath = (prNumber: number): string =>
  path.join(getOutputDir(prNumber), "analysis.json");

export const ANALYSIS_PROMPT_TEMPLATE = (
  commentsJson: string,
  diffContent: string
): string => `You are analyzing whether PR review comments have been addressed by code changes.

## Review Comments (JSON)
${commentsJson}

## Git Diff
\`\`\`diff
${diffContent}
\`\`\`

For each comment, determine:
1. Whether the comment is addressed by the diff
2. A brief reasoning for your decision
3. A short context-aware reply message to post (e.g., "Fixed the null check as suggested", "Renamed variable to improve clarity")

Return JSON matching this schema:
{
  "analyses": [
    {
      "commentId": <number>,
      "isAddressed": <boolean>,
      "reasoning": "<brief explanation>",
      "suggestedReply": "<context-aware reply text>"
    }
  ]
}

Guidelines:
- A comment is "addressed" if the diff shows changes that directly respond to the feedback
- Be conservative: if uncertain, mark as not addressed
- Consider the file path and line number context
- Look for semantic changes, not just any modification to the file
- Make the suggestedReply specific to what was actually changed`;
