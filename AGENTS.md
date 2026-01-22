## Repository overview

- **Name:** cli-agent-sandbox
- **Purpose:** Minimal TypeScript CLI sandbox for testing agent workflows.
- **Entry point:** `src/cli/guestbook/main.ts` (runs via `pnpm run:guestbook`).
- **Framework:** Uses `@openai/agents` with file tools scoped to `tmp`.

## Setup

1. Install Node.js and pnpm.
2. Install dependencies: `pnpm install`

## Environment

- Set `OPENAI_API_KEY` (export it or use a `.env`) to run the guestbook and publication scraper.

## Common commands

Available pnpm scripts for development and testing:

| Command                        | Description                                      |
| ------------------------------ | ------------------------------------------------ |
| `pnpm run:guestbook`           | Run the interactive guestbook CLI demo           |
| `pnpm run:scrape-publications` | Scrape publication links and build a review page |
| `pnpm typecheck`               | Run TypeScript type checking                     |
| `pnpm lint`                    | Run ESLint for code quality                      |
| `pnpm format`                  | Format code with Prettier                        |
| `pnpm format:check`            | Check code formatting                            |
| `pnpm test`                    | Run Vitest test suite                            |

## Project layout

| Path                                      | Description                                     |
| ----------------------------------------- | ----------------------------------------------- |
| `src/cli/guestbook/main.ts`               | Guestbook CLI entry point                       |
| `src/cli/guestbook/README.md`             | Guestbook CLI docs                              |
| `src/cli/scrape-publications/main.ts`     | Publication scraping CLI entry point            |
| `src/cli/scrape-publications/README.md`   | Publication scraping CLI docs                   |
| `src/clients/*`                           | Publication scraping pipeline clients           |
| `src/tools/index.ts`                      | Tool exports                                    |
| `src/tools/fetch-url/fetch-url-tool.ts`   | Safe HTTP fetch tool with SSRF protection       |
| `src/tools/read-file/read-file-tool.ts`   | Agent tool for reading files under `tmp`        |
| `src/tools/write-file/write-file-tool.ts` | Agent tool for writing files under `tmp`        |
| `src/tools/list-files/list-files-tool.ts` | Agent tool for listing files under `tmp`        |
| `src/tools/utils/fs.ts`                   | Path safety utilities                           |
| `src/tools/utils/html-processing.ts`      | HTML sanitization + extraction helpers          |
| `src/tools/utils/url-safety.ts`           | URL safety + SSRF protection helpers            |
| `src/tools/utils/test-utils.ts`           | Shared test helpers                             |
| `src/tools/*/*.test.ts`                   | Vitest tests for tools and safety utils         |
| `src/types/index.ts`                      | Zod schemas for publication pipeline            |
| `eslint.config.ts`                        | ESLint configuration                            |
| `prettier.config.ts`                      | Prettier configuration                          |
| `tsconfig.json`                           | TypeScript configuration                        |
| `vitest.config.ts`                        | Vitest configuration                            |
| `tmp/`                                    | Runtime scratch space for tool + scraper output |

## Tools

File tools provide operations sandboxed to the `tmp/` directory with path validation. The `fetchUrl` tool adds SSRF protection and sanitizes HTML content before conversion.

| Tool        | Location                                  | Parameters                                                                               | Description                                             |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `fetchUrl`  | `src/tools/fetch-url/fetch-url-tool.ts`   | `url`, `timeoutMs?`, `maxBytes?`, `maxRedirects?`, `maxChars?`, `etag?`, `lastModified?` | Fetches URLs safely and returns sanitized Markdown/text |
| `readFile`  | `src/tools/read-file/read-file-tool.ts`   | `path` (string)                                                                          | Reads file content from `tmp`                           |
| `writeFile` | `src/tools/write-file/write-file-tool.ts` | `path`, `content` (strings)                                                              | Writes content to file in `tmp`                         |
| `listFiles` | `src/tools/list-files/list-files-tool.ts` | `path` (string, optional)                                                                | Lists files under `tmp`                                 |

## Agent notes

- Use pnpm for scripts and dependency changes.
- Keep changes small and focused; update tests when behavior changes.
- Do not run git operations that change repo state: no `git commit`, `git push`, or opening PRs.
- Read-only git commands are allowed (e.g., `git status`, `git diff`, `git log`).
- Do not read `.env` files or any other secrets.
