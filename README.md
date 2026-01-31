# cli-agent-sandbox

A minimal TypeScript CLI sandbox for testing agent workflows and safe web scraping. This is a single-package repo built with [`@openai/agents`](https://github.com/openai/openai-agents-js), and it includes a guestbook demo, a Finnish name explorer CLI, a publication scraping pipeline with a Playwright-based scraper for JS-rendered pages, an ETF backtest CLI, an agent evals CLI, an AI usage summary CLI, a PR comment fixer CLI, an update-docs CLI for diff-driven doc sync, and agent tools scoped to `tmp` with strong safety checks.

## Quick Start

1. Install Node.js and pnpm
2. Install dependencies: `pnpm install`
3. Install Playwright system deps (Chromium): `pnpm exec playwright install-deps chromium`
4. Set `OPENAI_API_KEY` (export it or add to `.env`)
5. Run the demo: `pnpm run:guestbook`
6. (Optional) Run agent evals: `pnpm run:agent-evals -- --suite=example`
7. (Optional) Explore Finnish name stats: `pnpm run:name-explorer -- --mode ai|stats`
8. (Optional) Run publication scraping: `pnpm run:scrape-publications -- --url="https://example.com"`
9. (Optional) Run ETF backtest: `pnpm run:etf-backtest -- --isin=IE00B5BMR087` (requires Python setup below)
10. (Optional) Summarize AI usage: `pnpm ai:usage --since 7d`
11. (Optional) Fetch PR comments: `pnpm run:fix-pr-comments -- --pr=10`
12. (Optional) Update docs from a branch diff: `pnpm run:update-docs`

### Python Setup (for ETF backtest)

```bash
# On Debian/Ubuntu, install venv support first:
sudo apt install python3-venv

python3 -m venv .venv
source .venv/bin/activate
pip install numpy pandas torch
```

## Commands

| Command                        | Description                                                  |
| ------------------------------ | ------------------------------------------------------------ |
| `pnpm run:guestbook`           | Run the interactive guestbook CLI demo                       |
| `pnpm run:agent-evals`         | Run agent evaluation suites and generate reports             |
| `pnpm run:name-explorer`       | Explore Finnish name statistics (AI Q&A or stats)            |
| `pnpm run:scrape-publications` | Scrape publication links and build a review page             |
| `pnpm run:etf-backtest`        | Run ETF backtest + feature optimizer (requires Python)       |
| `pnpm run:fix-pr-comments`     | Fetch PR comments, write markdown/JSON, optionally run Codex |
| `pnpm run:update-docs`         | Generate a branch diff and optionally run Codex to sync docs |
| `pnpm ai:usage`                | Summarize Claude/Codex token usage for a repo                |
| `pnpm typecheck`               | Run TypeScript type checking                                 |
| `pnpm lint`                    | Run ESLint for code quality                                  |
| `pnpm lint:fix`                | Run ESLint and auto-fix issues                               |
| `pnpm format`                  | Format code with Prettier                                    |
| `pnpm format:check`            | Check code formatting                                        |
| `pnpm test`                    | Run Vitest test suite                                        |

## Publication scraping

The `run:scrape-publications` script scrapes a target page for publication links, uses an agent to infer title/date selectors, fetches publication pages, extracts content, and generates an HTML review page.

Usage:

```
pnpm run:scrape-publications -- --url="https://example.com" [--refetch] [--filterUrl="substring"]
```

Outputs are written under `tmp/scraped-publications/<url-slug>/`, including source content, link discovery artifacts, publication HTML/Markdown, extraction reports, and `review.html`.

### Playwright scraper

The publication pipeline uses `PlaywrightScraper` to render JavaScript-heavy pages and sanitize the resulting HTML before Markdown conversion. It supports per-request timeouts, load wait strategies (`load`, `domcontentloaded`, `networkidle`), and an optional `waitForSelector` for SPA content.

## Name explorer

The `run:name-explorer` script explores Finnish name statistics. It supports an AI Q&A mode (default) backed by SQL tools, plus a `stats` mode that generates an HTML report.

<img src="src/cli/name-explorer/demo-1.png" alt="Name Explorer demo" width="820" />

Usage:

```
pnpm run:name-explorer -- [--mode ai|stats] [--refetch]
```

Outputs are written under `tmp/name-explorer/`, including `statistics.html` in stats mode.

## ETF backtest

The `run:etf-backtest` CLI fetches ETF history from justetf.com (via Playwright), caches it under
`tmp/etf-backtest/<ISIN>/data.json`, and runs the Python experiment loop via the `runPython` tool.

<img src="src/cli/etf-backtest/demo-1.png" alt="ETF Backtest demo" width="820" />

Usage:

```
pnpm run:etf-backtest -- --isin=IE00B5BMR087 [--maxIterations=5] [--seed=42] [--refresh] [--verbose]
```

Notes:

- `--refresh` forces a refetch; otherwise cached data is reused.
- Python scripts live in `src/cli/etf-backtest/scripts/`.

## Agent evals

The `run:agent-evals` CLI executes evaluation suites for agents and writes reports under `tmp/agent-evals/` by default.

Usage:

```
pnpm run:agent-evals -- --suite=example
pnpm run:agent-evals -- --all
```

## AI usage

The `ai:usage` CLI summarizes Claude and Codex token usage for a repo based on local logs and `ai-usage.pricing.json`.

Usage:

```
pnpm ai:usage
pnpm ai:usage --since 24h
pnpm ai:usage --since 30d --repo /path/to/repo
pnpm ai:usage --json
```

Notes:

- Defaults to the last 7 days for the current git repo (or `cwd` when not in a git repo).
- Log sources: `~/.claude/projects/<encoded-repo>/` and `$CODEX_HOME/sessions` or `~/.codex/sessions`.

## Fix PR comments

The `run:fix-pr-comments` CLI fetches conversation + inline review comments for a GitHub PR, writes markdown/JSON artifacts under `tmp/pr-comments/pr-<number>/`, and optionally launches Codex to implement fixes.

Usage:

```
pnpm run:fix-pr-comments -- --pr=10
pnpm run:fix-pr-comments -- --repo=owner/repo
pnpm run:fix-pr-comments -- --no-codex
```

Notes:

- Requires the `gh` CLI and authentication (`gh auth login`).
- If Codex is unavailable or all review comments are already marked `fixed` in `answers.json`, the auto-fix step is skipped.
- Review comments marked `fixed` in `answers.json` are skipped in later runs (and `review-comments.json` only includes unfixed entries).
- Runs `pnpm typecheck`, `pnpm lint`, and `pnpm format` at the end.

## Update docs

The `run:update-docs` CLI compares the current branch against a base branch, writes a diff summary, and optionally launches Codex to sync documentation.

Usage:

```
pnpm run:update-docs
pnpm run:update-docs --base=develop
pnpm run:update-docs --no-codex
```

Notes:

- Requires git for branch/diff commands.
- If the `codex` CLI is missing, it logs a warning and skips the auto-update step.
- Always runs `pnpm format` at the end.
- Output is written to `tmp/update-docs/<branch>/changes.md` when changes are detected.

## Tools

File tools are sandboxed to the `tmp/` directory with path validation to prevent traversal and symlink attacks. The `fetchUrl` tool adds SSRF protections and HTML sanitization, and `runPython` executes whitelisted Python scripts from a configured directory.

| Tool         | Location                                    | Description                                                                    |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `fetchUrl`   | `src/tools/fetch-url/fetch-url-tool.ts`     | Fetches URLs safely and returns sanitized Markdown/text                        |
| `readFile`   | `src/tools/read-file/read-file-tool.ts`     | Reads file content from `tmp` directory                                        |
| `writeFile`  | `src/tools/write-file/write-file-tool.ts`   | Writes content to files in `tmp` directory                                     |
| `listFiles`  | `src/tools/list-files/list-files-tool.ts`   | Lists files and directories under `tmp`                                        |
| `deleteFile` | `src/tools/delete-file/delete-file-tool.ts` | Deletes files under the `tmp` directory                                        |
| `runPython`  | `src/tools/run-python/run-python-tool.ts`   | Runs Python scripts from a configured scripts directory (JSON stdin supported) |

`runPython` details:

- `scriptName` must be a `.py` file name in the configured scripts directory (no subpaths).
- `input` is a JSON string passed to stdin (use `""` for no input).

## Project Structure

```
src/
├── cli/
│   ├── ai-usage/
│   │   ├── main.ts            # AI usage CLI entry point
│   │   ├── README.md          # AI usage CLI docs
│   │   ├── ai-usage.pricing.json # Model pricing lookup
│   │   ├── constants.ts       # CLI constants
│   │   ├── types/             # CLI schemas
│   │   │   └── schemas.ts     # CLI args + pricing schemas
│   │   └── clients/           # Pipeline + log readers + aggregation + formatting
│   ├── agent-evals/
│   │   ├── main.ts            # Agent evals CLI entry point
│   │   ├── README.md          # Agent evals CLI docs
│   │   ├── constants.ts       # CLI constants
│   │   ├── types/             # CLI schemas
│   │   │   └── schemas.ts     # CLI args + suite schemas
│   │   ├── clients/           # Suite runner + report generator
│   │   ├── utils/             # Assertion + formatting helpers
│   │   └── suites/            # Example evaluation suites
│   ├── etf-backtest/
│   │   ├── main.ts            # ETF backtest CLI entry point
│   │   ├── README.md          # ETF backtest docs
│   │   ├── constants.ts       # CLI constants
│   │   ├── types/             # CLI schemas
│   │   │   └── schemas.ts     # CLI args + agent output schemas
│   │   ├── clients/           # Data fetcher + Playwright capture
│   │   ├── utils/             # Scoring + formatting helpers
│   │   └── scripts/           # Python backtest + prediction scripts
│   ├── fix-pr-comments/
│   │   ├── main.ts            # PR comments CLI entry point
│   │   ├── README.md          # PR comments CLI docs
│   │   ├── constants.ts       # CLI constants
│   │   ├── types/             # CLI schemas
│   │   │   └── schemas.ts     # CLI args + comment schemas
│   │   └── clients/           # GitHub + formatting pipeline
│   ├── update-docs/
│   │   ├── main.ts            # Update docs CLI entry point
│   │   ├── README.md          # Update docs CLI docs
│   │   ├── constants.ts       # CLI constants
│   │   ├── types/             # CLI schemas
│   │   │   └── schemas.ts     # CLI args schema
│   │   └── clients/           # Git + diff formatting pipeline
│   ├── guestbook/
│   │   ├── main.ts            # Guestbook CLI entry point
│   │   ├── README.md          # Guestbook CLI docs
│   │   └── types/             # CLI schemas
│   │       └── schemas.ts     # Guestbook output schema
│   ├── name-explorer/
│   │   ├── main.ts            # Name Explorer CLI entry point
│   │   ├── README.md          # Name Explorer CLI docs
│   │   └── types/             # CLI schemas + data types
│   │       ├── ai-output.ts   # Agent output schema
│   │       ├── index.ts       # Type exports
│   │       ├── schemas.ts     # CLI args schema
│   │       └── stats.ts       # Statistics types
│   └── scrape-publications/
│       ├── main.ts            # Publication scraping CLI entry point
│       ├── README.md          # Publication scraping docs
│       ├── clients/           # Publication-specific clients
│       │   ├── publication-pipeline.ts # Pipeline orchestration
│       │   ├── publication-scraper.ts  # Link discovery + selector inference
│       │   └── review-page-generator.ts # Review HTML generator
│       └── types/
│           ├── index.ts       # Publication Zod schemas
│           └── schemas.ts     # CLI args schema
├── clients/
│   ├── agent-runner.ts        # Default agent runner wrapper
│   ├── codex-client.ts        # Codex CLI launcher
│   ├── fetch.ts               # Shared HTTP fetch + sanitization
│   ├── github-client.ts       # GitHub CLI API client (PR metadata/comments)
│   ├── git-client.ts          # Git CLI wrapper (branch, diff, changed files)
│   ├── logger.ts              # Shared console logger
│   └── playwright-scraper.ts  # Playwright-based web scraper
├── utils/
│   ├── parse-args.ts          # Shared CLI arg parsing helper
│   └── question-handler.ts    # Shared CLI prompt + validation helper
├── tools/
│   ├── delete-file/           # Delete file tool
│   ├── fetch-url/             # Safe fetch tool
│   ├── list-files/            # List files tool
│   ├── read-file/             # Read file tool
│   ├── run-python/            # Run Python scripts tool
│   ├── write-file/            # Write file tool
│   └── utils/
│       ├── fs.ts              # Path safety utilities
│       ├── html-processing.ts # HTML sanitization + extraction helpers
│       ├── url-safety.ts      # SSRF protection helpers
│       └── test-utils.ts      # Shared test helpers
tmp/                           # Runtime scratch space (tool I/O)
```

## CLI conventions

- When using `Logger`, initialize it in the CLI entry point and pass it into clients/pipelines via constructor options.
- Use `AgentRunner` (`src/clients/agent-runner.ts`) as the default wrapper when running agents.
- Prefer shared helpers in `src/utils` (`parse-args`, `question-handler`) over custom argument parsing or prompt logic.
- Use the TypeScript path aliases for shared modules: `~tools/*`, `~clients/*`, `~utils/*`.
  Example: `import { readFileTool } from "~tools/read-file/read-file-tool";`

## Security

File tools enforce strict path safety:

- Paths must be relative to `tmp/`
- Path traversal (`../`) is rejected
- Symlinks are rejected
- Real path validation ensures boundary enforcement

The `fetchUrl` tool adds SSRF protections (blocks localhost/private IPs and re-validates redirects) and sanitizes HTML before converting it to Markdown/text.
