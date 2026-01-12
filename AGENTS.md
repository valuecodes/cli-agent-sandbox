## Repository overview

- Name: cli-agent-sandbox
- Purpose: Minimal TypeScript CLI sandbox for testing agent workflows.
- Entry point: `src/main.ts` (runs via `pnpm start`).

## Setup

1. Install Node.js and pnpm.
2. Install dependencies: `pnpm install`

## Common commands

- `pnpm start` - run the CLI
- `pnpm typecheck` - TypeScript typecheck
- `pnpm lint` - run ESLint
- `pnpm format` - run Prettier
- `pnpm test` - run Vitest

## Project layout

- `src/main.ts` - CLI entry point
- `src/main.test.ts` - Vitest test file
- `eslint.config.ts`, `prettier.config.ts`, `tsconfig.json` - tooling config

## Agent notes

- Use pnpm for scripts and dependency changes.
- Keep changes small and focused; update tests when behavior changes.
- Do not run git operations that change repo state: no `git commit`, `git push`, or opening PRs.
- Read-only git commands are allowed (e.g., `git status`, `git diff`, `git log`).
- Do not read `.env` files or any other secrets.
