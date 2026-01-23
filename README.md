# cli-agent-sandbox

A minimal TypeScript CLI sandbox for testing agent workflows and safe web scraping. This is a single-package repo built with [`@openai/agents`](https://github.com/openai/openai-agents-js), and it includes a guestbook demo, a Finnish name explorer CLI, a publication scraping pipeline with a Playwright-based scraper for JS-rendered pages, and agent tools scoped to `tmp` with strong safety checks.

## Quick Start

1. Install Node.js and pnpm
2. Install dependencies: `pnpm install`
3. Install Playwright system deps (Chromium): `pnpm exec playwright install-deps chromium`
4. Set `OPENAI_API_KEY` (export it or add to `.env`)
5. Run the demo: `pnpm run:guestbook`
6. (Optional) Explore Finnish name stats: `pnpm run:name-explorer -- --mode ai|stats`
7. (Optional) Run publication scraping: `pnpm run:scrape-publications -- --url="https://example.com"`

## Commands

| Command                        | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `pnpm run:guestbook`           | Run the interactive guestbook CLI demo            |
| `pnpm run:name-explorer`       | Explore Finnish name statistics (AI Q&A or stats) |
| `pnpm run:scrape-publications` | Scrape publication links and build a review page  |
| `pnpm typecheck`               | Run TypeScript type checking                      |
| `pnpm lint`                    | Run ESLint for code quality                       |
| `pnpm format`                  | Format code with Prettier                         |
| `pnpm format:check`            | Check code formatting                             |
| `pnpm test`                    | Run Vitest test suite                             |

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

Usage:

```
pnpm run:name-explorer -- [--mode ai|stats] [--refetch]
```

Outputs are written under `tmp/name-explorer/`, including `statistics.html` in stats mode.

## Tools

File tools are sandboxed to the `tmp/` directory with path validation to prevent traversal and symlink attacks. The `fetchUrl` tool adds SSRF protections and HTML sanitization.

| Tool        | Location                                  | Description                                             |
| ----------- | ----------------------------------------- | ------------------------------------------------------- |
| `fetchUrl`  | `src/tools/fetch-url/fetch-url-tool.ts`   | Fetches URLs safely and returns sanitized Markdown/text |
| `readFile`  | `src/tools/read-file/read-file-tool.ts`   | Reads file content from `tmp` directory                 |
| `writeFile` | `src/tools/write-file/write-file-tool.ts` | Writes content to files in `tmp` directory              |
| `listFiles` | `src/tools/list-files/list-files-tool.ts` | Lists files and directories under `tmp`                 |

## Project Structure

```
src/
├── cli/
│   ├── guestbook/
│   │   ├── main.ts            # Guestbook CLI entry point
│   │   └── README.md          # Guestbook CLI docs
│   ├── name-explorer/
│   │   ├── main.ts            # Name Explorer CLI entry point
│   │   └── README.md          # Name Explorer CLI docs
│   └── scrape-publications/
│       ├── main.ts            # Publication scraping CLI
│       └── README.md          # Publication scraping docs
├── clients/
│   ├── fetch.ts                # HTTP fetch + sanitization helpers
│   ├── logger.ts               # Console logger
│   ├── playwright-scraper.ts   # Playwright-based scraper for JS-rendered pages
│   ├── publication-pipeline.ts # Pipeline orchestration
│   ├── publication-scraper.ts  # Link discovery + selector inference
│   └── review-page-generator.ts # Review HTML generator
├── utils/
│   ├── parse-args.ts          # Shared CLI arg parsing helper
│   └── question-handler.ts    # Shared CLI prompt + validation helper
├── tools/
│   ├── fetch-url/
│   │   ├── fetch-url-tool.ts      # Safe fetch tool
│   │   └── fetch-url-tool.test.ts # Fetch tool tests
│   ├── index.ts          # Tool exports
│   ├── list-files/
│   │   ├── list-files-tool.ts      # List tool implementation
│   │   └── list-files-tool.test.ts # List tool tests
│   ├── read-file/
│   │   ├── read-file-tool.ts       # Read tool implementation
│   │   └── read-file-tool.test.ts  # Read tool tests
│   ├── write-file/
│   │   ├── write-file-tool.ts      # Write tool implementation
│   │   └── write-file-tool.test.ts # Write tool tests
│   └── utils/
│       ├── fs.ts               # Path safety utilities
│       ├── html-processing.ts  # HTML sanitization + extraction helpers
│       ├── html-processing.test.ts # HTML processing tests
│       ├── url-safety.ts       # SSRF protection helpers
│       ├── url-safety.test.ts  # URL safety tests
│       └── test-utils.ts       # Shared test helpers
└── types/
    └── index.ts                    # Zod schemas for publication pipeline
tmp/                      # Runtime scratch space (tool I/O)
```

## CLI conventions

- When using `Logger`, initialize it in the CLI entry point and pass it into clients/pipelines via constructor options.
- Prefer shared helpers in `src/utils` (`parse-args`, `question-handler`) over custom argument parsing or prompt logic.

## Security

File tools enforce strict path safety:

- Paths must be relative to `tmp/`
- Path traversal (`../`) is rejected
- Symlinks are rejected
- Real path validation ensures boundary enforcement

The `fetchUrl` tool adds SSRF protections (blocks localhost/private IPs and re-validates redirects) and sanitizes HTML before converting it to Markdown/text.
