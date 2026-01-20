# cli-agent-sandbox

A minimal TypeScript CLI sandbox for testing agent workflows. Built with [`@openai/agents`](https://github.com/openai/openai-agents-js), it provides file tools scoped to a `tmp` directory with comprehensive path safety validation.

## Quick Start

1. Install Node.js and pnpm
2. Install dependencies: `pnpm install`
3. Set `OPENAI_API_KEY` (export it or add to `.env`)
4. Run the demo: `pnpm run:guestbook`

## Commands

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `pnpm run:guestbook` | Run the interactive guestbook CLI demo |
| `pnpm typecheck`     | Run TypeScript type checking           |
| `pnpm lint`          | Run ESLint for code quality            |
| `pnpm format`        | Format code with Prettier              |
| `pnpm format:check`  | Check code formatting                  |
| `pnpm test`          | Run Vitest test suite                  |

## Tools

Agent tools are sandboxed to the `tmp/` directory. All paths are validated to prevent directory traversal and symlink attacks.

| Tool        | Location                       | Description                                |
| ----------- | ------------------------------ | ------------------------------------------ |
| `readFile`  | `src/tools/read-file-tool.ts`  | Reads file content from `tmp` directory    |
| `writeFile` | `src/tools/write-file-tool.ts` | Writes content to files in `tmp` directory |

## Project Structure

```
src/
├── guestbook.ts          # CLI entry point
└── tools/
    ├── read-file-tool.ts # Read tool implementation
    ├── write-file-tool.ts# Write tool implementation
    ├── utils.ts          # Path safety utilities
    └── *.test.ts         # Tool tests
tmp/                      # Runtime scratch space (tool I/O)
```

## Security

File tools enforce strict path safety:

- Paths must be relative to `tmp/`
- Path traversal (`../`) is rejected
- Symlinks are rejected
- Real path validation ensures boundary enforcement
