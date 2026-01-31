# AGENTS.md — Operating Guide for AI Agents

## 0) TL;DR (Agent quick start)

**Goal:** Make small, safe, test-covered changes in this TypeScript CLI sandbox.

**Repo:** `cli-agent-sandbox` — minimal TypeScript CLI sandbox built with `@openai/agents` and tool sandboxing under `tmp/`.

1. Start at `src/cli/<cli>/main.ts` and the matching `src/cli/<cli>/README.md`.
2. Follow the pipeline classes under `src/cli/<cli>/clients/*` and schemas under `src/cli/<cli>/types/schemas.ts`.
3. Reuse shared helpers: `src/utils/parse-args.ts`, `src/utils/question-handler.ts`, `src/clients/logger.ts`.
4. Keep `main.ts` focused on the basic agent flow; move non-trivial logic into `clients/` or `utils/`.
5. Keep changes minimal; add/update **Vitest** tests (`*.test.ts`) when behavior changes.
6. Run: `pnpm typecheck`, `pnpm lint`, `pnpm test` (and `pnpm format:check` if formatting changed).
7. All runtime artifacts go under `tmp/` (never commit them).

**Scratch space:** Use `tmp/` for generated HTML/markdown/JSON/reports (for example `tmp/pr-comments/pr-<number>/` with `answers.json` from the PR comments CLI).

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
- If a task requires Python (e.g., `etf-backtest`), set up the venv:
  ```bash
  # On Debian/Ubuntu, install venv support first: sudo apt install python3-venv
  python3 -m venv .venv
  source .venv/bin/activate
  pip install numpy pandas torch
  ```

**Common scripts (see `package.json` for all):**

- `pnpm run:[cli-name-here]`
- `pnpm ai:usage` (summarize Claude/Codex usage logs for a repo)
- `pnpm typecheck`
- `pnpm lint` (use `pnpm lint:fix` if errors are auto-fixable)
- `pnpm format` / `pnpm format:check`
- `pnpm test`

**Scaffolding a new CLI:**

```
pnpm scaffold:cli -- --name=my-cli --description="What it does"
```

Creates `src/cli/my-cli/` with starter files. After scaffolding:

1. Add `"run:my-cli": "tsx src/cli/my-cli/main.ts"` to `package.json`
2. Implement logic in `main.ts`
3. Update `src/cli/my-cli/README.md` with the CLI description, arguments, and flowchart

**Rule:** When creating a new CLI, use `pnpm scaffold:cli` — don't create ad-hoc folders.

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
- **`deleteFile`** (`src/tools/delete-file/delete-file-tool.ts`)
  - Deletes a file under `tmp/`.
  - Params: `{ path: string }` (path is **relative to `tmp/`**)
- **`runPython`** (`src/tools/run-python/run-python-tool.ts`)
  - Runs a Python script from a configured scripts directory.
  - Params: `{ scriptName: string, input: string }` (input is JSON string; pass `""` for no input)

### Safe web fetch tool

- **`fetchUrl`** (`src/tools/fetch-url/fetch-url-tool.ts`)
  - SSRF protection + redirect validation + HTML sanitization + markdown/text conversion.
  - Params: `{ url, timeoutMs?, maxBytes?, maxRedirects?, maxChars?, etag?, lastModified? }`
  - Output: sanitized content, metadata, and warnings.

---

## 5) Coding conventions (how changes should look)

- Initialize `Logger` in CLI entry points and pass it into clients/pipelines via constructor options.
- Use `Logger` instead of `console.log`/`console.error` for output.
- Prefer top-level `await` with `try/catch` over `.then()/.catch()` chains in CLI entry points.
- Use `AgentRunner` (`src/clients/agent-runner.ts`) as the default wrapper when running agents.
- Prefer shared helpers in `src/utils` (`parse-args`, `question-handler`) over custom logic.
- `main.ts` should stay focused on the **basic agent flow**: argument parsing → agent setup → run loop → final output. Move helper logic into `clients/` or `utils/`
- Prefer TypeScript path aliases over deep relative imports: `~tools/*`, `~clients/*`, `~utils/*`.
- Use Zod schemas for CLI args and tool IO.
- Keep object field names in `camelCase` (e.g., `trainSamples`), not `snake_case`.
- Keep Zod schemas in a dedicated `types/schemas.ts` file for each CLI (avoid inline schemas in `main.ts`).
- Keep constants in a dedicated `constants.ts` file for each CLI.
- Move hardcoded numeric values into `constants.ts` (treat numbers as configuration).
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

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `agent/PLANS.md`) from design to implementation.
