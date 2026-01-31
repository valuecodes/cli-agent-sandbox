import path from "node:path";

export const OUTPUT_BASE_DIR = path.join("tmp", "update-docs");
export const CHANGES_FILENAME = "changes.md";

export const getOutputDir = (branch: string): string =>
  path.join(process.cwd(), OUTPUT_BASE_DIR, branch);

export const getChangesPath = (branch: string): string =>
  path.join(getOutputDir(branch), CHANGES_FILENAME);

export const CODEX_PROMPT_TEMPLATE = (diffPath: string): string =>
  `Review the code changes in ${diffPath} and update the repository documentation accordingly.

Use the docs-sync skill at .codex/skills/docs-sync/SKILL.md for guidelines.

Documentation targets (in priority order):
1. README.md - Update if new features, changed usage, or new dependencies
2. AGENTS.md - Update if new patterns, conventions, or tools added (do NOT edit CLAUDE.md - it is a symlink to AGENTS.md)
3. src/cli/*/README.md - Update CLI-specific docs for changed CLIs
4. Inline JSDoc comments - Add/update for changed/new functions

Guidelines:
- Only update docs that are actually affected by the changes
- Keep documentation concise and accurate
- Follow existing documentation style
- Don't add unnecessary documentation`;
