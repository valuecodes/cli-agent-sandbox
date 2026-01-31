# Fix PR Comments CLI

Fetch conversation + review comments from a GitHub PR, write markdown/JSON artifacts, and optionally launch Codex to address review feedback.

## Run

```bash
# Default: auto-detect PR from current branch
pnpm run:fix-pr-comments

# With options
pnpm run:fix-pr-comments -- --pr=10
pnpm run:fix-pr-comments -- --repo=owner/repo
pnpm run:fix-pr-comments -- --no-codex
```

## Arguments

- `--pr` (optional): PR number. If omitted, detects from the current branch via `gh pr view`.
- `--repo` (optional): Repository in `owner/repo` format. If omitted, detects from the current directory via `gh repo view`.
- `--codex` (default: true): Launch `codex` after fetching comments. Use `--no-codex` to skip.

## Workflow

1. Ensures `gh` is installed and authenticated
2. Resolves repo/PR (auto-detect or `--repo`/`--pr`)
3. Fetches conversation + inline review comments
4. Loads existing `answers.json` and filters out review comments marked `fixed`
5. Writes markdown + JSON artifacts under `tmp/pr-comments/pr-<number>/`
6. Launches Codex (if enabled + available) to fix issues and update `answers.json`
7. Runs code quality checks: `pnpm typecheck`, `pnpm lint`, `pnpm format`

## Prerequisites

- `gh` CLI must be installed and authenticated (`gh auth login`)
- `codex` CLI is optional; if missing, the tool logs a warning and continues without auto-fix

## Output

Comments are written to:

```
tmp/pr-comments/pr-{number}/all-comments.md
tmp/pr-comments/pr-{number}/review-comments.json
tmp/pr-comments/pr-{number}/conversation-comments.json
tmp/pr-comments/pr-{number}/answers.json
```

The markdown file includes:

- PR header (`# PR #<number> — <owner/repo>`)
- Conversation comments (top-level PR discussion)
- Inline review comments (diff comments and replies) with file path + line number
- Original comment URLs

Notes:

- `review-comments.json` includes only **unfixed** review comments, based on `answers.json`.
- `answers.json` entries use `{ commentId, fixed }` and are merged across runs.

If the current branch has no PR and `--pr` is not provided, the CLI exits with an error prompting you to pass `--pr=<number>`.

## Internals

- `FixPrPipeline` orchestrates gh auth checks, comment fetching, output writing, Codex launch, and code quality checks
- `GitHubClient` wraps `gh` calls (`gh pr view`, `gh repo view`, and `gh api` endpoints)
- `CommentFormatter` builds the markdown output
- `constants.ts` defines output paths and the Codex prompt template
