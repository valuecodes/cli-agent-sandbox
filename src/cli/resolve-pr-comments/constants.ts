import path from "node:path";

export const OUTPUT_BASE_DIR = path.join("tmp", "resolve-pr-comments");
export const MAX_DIFF_CHARS = 50000;

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
1. The status of whether the comment is addressed
2. A brief reasoning for your decision
3. A short context-aware reply message

Return JSON matching this schema:
{
  "analyses": [
    {
      "commentId": <number>,
      "status": "addressed" | "uncertain" | "not_addressed",
      "reasoning": "<brief explanation>",
      "suggestedReply": "<context-aware reply text>"
    }
  ]
}

## Status Definitions

- **addressed**: The diff clearly and completely fixes the issue raised in the comment. Use this when you are confident the feedback has been fully addressed.
  Example replies: "Thanks, added the null check!" or "Done - switched to the safer API."

- **uncertain**: The diff contains changes that might address the comment, but you're not confident. Use this when:
  - The fix appears partial or incomplete
  - The change is in the right area but you can't verify correctness
  - There are related changes but the specific concern may not be resolved
  - Human verification is needed to confirm the fix
  Example replies: "I've added a check here - does this cover your concern?" or "Updated this - let me know if it's what you had in mind."

- **not_addressed**: No relevant changes in the diff for this comment. The feedback has not been acted upon.

## Reply Tone Guidelines
- Write replies as a friendly collaborator, not a formal bot
- Use natural, conversational language (e.g., "Thanks! I've added..." not "The issue has been addressed by adding...")
- Keep replies concise - 1-2 sentences is ideal
- Use first person ("I added...", "I've updated...") when describing changes made
- Avoid formal phrases like "Please note that...", "It should be noted...", "Consider...", "Please also..."
- For partial fixes, be direct: "Good catch - I've added X but still need to handle Y" rather than "You partially addressed this by..."
- Sound like a human developer responding to a code review

## Guidelines
- Consider the file path and line number context
- Look for semantic changes, not just any modification to the file
- For "addressed" status, make the suggestedReply specific to what was changed
- For "uncertain" status, the suggestedReply should ask for verification in a friendly way
- For "not_addressed" status, still provide a suggestedReply (it won't be posted, but useful for logging)`;
