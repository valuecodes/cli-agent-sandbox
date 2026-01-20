## Repository overview

- **Name:** cli-agent-sandbox
- **Purpose:** Minimal TypeScript CLI sandbox for testing agent workflows.
- **Entry point:** `src/guestbook.ts` (runs via `pnpm run:guestbook`).
- **Framework:** Uses `@openai/agents` with file tools scoped to `tmp`.

## Setup

1. Install Node.js and pnpm.
2. Install dependencies: `pnpm install`

## Environment

- Set `OPENAI_API_KEY` (export it or use a `.env`) to run the guestbook.

## Common commands

Available pnpm scripts for development and testing:

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `pnpm run:guestbook` | Run the interactive guestbook CLI demo |
| `pnpm typecheck`     | Run TypeScript type checking           |
| `pnpm lint`          | Run ESLint for code quality            |
| `pnpm format`        | Format code with Prettier              |
| `pnpm format:check`  | Check code formatting                  |
| `pnpm test`          | Run Vitest test suite                  |

## Project layout

| Path                           | Description                              |
| ------------------------------ | ---------------------------------------- |
| `src/guestbook.ts`             | CLI entry point                          |
| `src/tools/index.ts`           | Tool exports                             |
| `src/tools/read-file/read-file-tool.ts`  | Agent tool for reading files under `tmp` |
| `src/tools/write-file/write-file-tool.ts` | Agent tool for writing files under `tmp` |
| `src/tools/list-files/list-files-tool.ts` | Agent tool for listing files under `tmp` |
| `src/tools/utils/fs.ts`        | Path safety utilities                    |
| `src/tools/utils/test-utils.ts`| Shared test helpers                      |
| `src/tools/*/*.test.ts`        | Vitest tests for tool path safety        |
| `eslint.config.ts`             | ESLint configuration                     |
| `prettier.config.ts`           | Prettier configuration                   |
| `tsconfig.json`                | TypeScript configuration                 |
| `vitest.config.ts`             | Vitest configuration                     |
| `tmp/`                         | Runtime scratch space for tool I/O       |

## Tools

Agent tools provide file operations sandboxed to the `tmp/` directory. Path traversal and symlinks are rejected to ensure security. Tools are implemented in `src/tools/` subfolders with path safety helpers in `src/tools/utils/fs.ts`.

| Tool        | Location                       | Parameters                  | Description                     |
| ----------- | ------------------------------ | --------------------------- | ------------------------------- |
| `readFile`  | `src/tools/read-file/read-file-tool.ts`  | `path` (string)             | Reads file content from `tmp`   |
| `writeFile` | `src/tools/write-file/write-file-tool.ts` | `path`, `content` (strings) | Writes content to file in `tmp` |
| `listFiles` | `src/tools/list-files/list-files-tool.ts` | `path` (string, optional)   | Lists files under `tmp`         |

## Agent notes

- Use pnpm for scripts and dependency changes.
- Keep changes small and focused; update tests when behavior changes.
- Do not run git operations that change repo state: no `git commit`, `git push`, or opening PRs.
- Read-only git commands are allowed (e.g., `git status`, `git diff`, `git log`).
- Do not read `.env` files or any other secrets.
