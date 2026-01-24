# AGENTS.md — Operating Guide for AI Agents

## 0) TL;DR (Agent quick start)

**Goal:** Make small, safe, test-covered changes in this TypeScript CLI sandbox.

**Repo:** `cli-agent-sandbox` — minimal TypeScript CLI sandbox built with `@openai/agents` and tool sandboxing under `tmp/`.

1. Start at `src/cli/<cli>/main.ts` and the matching `src/cli/<cli>/README.md`.
2. Follow the pipeline classes under `src/cli/<cli>/clients/*` and schemas under `src/cli/<cli>/types/*`.
3. Reuse shared helpers: `src/utils/parse-args.ts`, `src/utils/question-handler.ts`, `src/clients/logger.ts`.
4. Keep changes minimal; add/update **Vitest** tests (`*.test.ts`) when behavior changes.
5. Run: `pnpm typecheck`, `pnpm lint`, `pnpm test` (and `pnpm format:check` if formatting changed).
6. All runtime artifacts go under `tmp/` (never commit them).

**Scratch space:** Use `tmp/` for generated HTML/markdown/JSON/reports.

---

## 1) Fast map (where to look first)

- Entry points: `src/cli/*/main.ts`
- Shared clients: `src/clients/*`
- Shared helpers: `src/utils/*`
- Agent tools: `src/tools/*`

---

## 2) Setup & commands

- Install deps: `pnpm install`
- Set `OPENAI_API_KEY` via env or `.env` (humans do this; agents must not read secrets)
- If a task requires Playwright, follow the repo README for system deps

**Common scripts (see `package.json` for all):**

- `pnpm run:[cli-name-here]`
- `pnpm typecheck`
- `pnpm lint` (use `pnpm lint:fix` if errors are auto-fixable)
- `pnpm format` / `pnpm format:check`
- `pnpm test`

---

## 3) Hard rules (security & repo safety)

### MUST NOT

- **Do not read** `.env` files or any secrets.
- **Do not run** git commands that change repo state: `git commit`, `git push`, PR creation.
- **Do not bypass** SSRF protections or URL/path safety utilities.

### Allowed

- Read-only git commands: `git status`, `git diff`, `git log`.
- Writing runtime artifacts under `tmp/`.

---

## 4) Agent tools (runtime tool catalog)

All file tools are sandboxed to `tmp/` using path validation (`src/tools/utils/fs.ts`).

### File tools

- **`readFile`** (`src/tools/read-file/read-file-tool.ts`)
  - Reads a file under `tmp/`.
  - Params: `{ path: string }` (path is **relative to `tmp/`**)
- **`writeFile`** (`src/tools/write-file/write-file-tool.ts`)
  - Writes a file under `tmp/`.
  - Params: `{ path: string, content: string }` (path is **relative to `tmp/`**)
- **`listFiles`** (`src/tools/list-files/list-files-tool.ts`)
  - Lists files/dirs under `tmp/`.
  - Params: `{ path?: string }` (defaults to `tmp/` root)

### Safe web fetch tool

- **`fetchUrl`** (`src/tools/fetch-url/fetch-url-tool.ts`)
  - SSRF protection + redirect validation + HTML sanitization + markdown/text conversion.
  - Params: `{ url, timeoutMs?, maxBytes?, maxRedirects?, maxChars?, etag?, lastModified? }`
  - Output: sanitized content, metadata, and warnings.

---

## 5) Coding conventions (how changes should look)

- Initialize `Logger` in CLI entry points and pass it into clients/pipelines via constructor options.
- Prefer shared helpers in `src/utils` (`parse-args`, `question-handler`) over custom logic.
- Use Zod schemas for CLI args and tool IO.
- For HTTP fetching in code, prefer `Fetch` (sanitized) or `PlaywrightScraper` for JS-heavy pages.
- When adding tools that touch files, use `src/tools/utils/fs.ts` for path validation.
- Comments should capture invariants or subtle behavior, not restate code.
- Prefer a class over a function when state/lifecycle or shared dependencies make it appropriate.
- Avoid `index.ts` barrel exports; use explicit module paths.

### Comment guidance (short)

- Use comments for intent/tradeoffs, contracts (inputs/outputs, invariants, side effects, errors), non-obvious behavior (ordering, caching, perf), or domain meanings.
- Avoid `@param`/`@returns` boilerplate and step-by-step narration that repeats the signature or body.
- Rule of thumb: each comment should say something the types cannot.

---

## 6) Definition of Done (before finishing)

- [ ] Change is minimal and localized
- [ ] Tests added/updated if behavior changed (`pnpm test`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Formatting is clean (`pnpm format:check` or `pnpm format`)
- [ ] No secrets accessed, no unsafe file/network behavior introduced
- [ ] Any generated artifacts are in `tmp/` only

---
