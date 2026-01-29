# Fix PR Comments CLI

Fetch all comments from a GitHub PR, write them to a markdown file, and optionally launch Codex to address review feedback.

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

## Prerequisites

- `gh` CLI must be installed and authenticated (`gh auth login`)
- `codex` CLI is optional; if missing, the tool logs a warning and continues without auto-fix

## Output

Comments are written to:

```
tmp/pr-comments/pr-{number}/all-comments.md
```

The markdown file includes:

- PR header (`# PR #<number> — <owner/repo>`)
- Conversation comments (top-level PR discussion)
- Inline review comments (diff comments and replies) with file path + line number
- Original comment URLs

If the current branch has no PR and `--pr` is not provided, the CLI exits with an error prompting you to pass `--pr=<number>`.

## Internals

- `FixPrPipeline` orchestrates gh auth checks, comment fetching, output writing, and Codex launch
- `GhClient` wraps `gh` calls (`gh pr view`, `gh repo view`, and `gh api` endpoints)
- `CommentFormatter` builds the markdown output
- `constants.ts` defines output paths and the Codex prompt template
