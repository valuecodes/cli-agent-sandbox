# ExecPlans for cli-agent-sandbox

This repo is a minimal TypeScript CLI sandbox. ExecPlans exist to make larger changes safe, reproducible, and testable by a novice who only has the repo and the plan. Keep plans tailored to this repository, not a generic template.

Use an ExecPlan only for complex features or significant refactors. For small, localized changes, skip the plan and just implement.

## Non-negotiables

- Self-contained: the plan must include all context needed to execute it without external docs or prior plans.
- Observable outcomes: describe what a human can run and see to prove the change works.
- Living document: update the plan as work proceeds; never let it drift from reality.
- Repo-safe: never read `.env`, never write outside the repo or `tmp/`, never commit or push.
- Minimal, test-covered changes: update or add Vitest tests when behavior changes.

## Repository context to embed in every plan

Include a short orientation paragraph naming the key paths and how they relate:

- Entry points live in `src/cli/<cli>/main.ts` with a matching `src/cli/<cli>/README.md`.
- Pipelines and clients live in `src/cli/<cli>/clients/*`; schemas in `src/cli/<cli>/types/*`.
- Shared helpers: `src/utils/parse-args.ts`, `src/utils/question-handler.ts`, `src/clients/logger.ts`.
- Tool sandboxing is under `src/tools/*` and path validation in `src/tools/utils/fs.ts`.
- Runtime artifacts belong under `tmp/` only.

If the plan adds a new CLI, state that it must be scaffolded via:

    pnpm scaffold:cli -- --name=my-cli --description="What it does"

Then add `"run:my-cli": "tsx src/cli/my-cli/main.ts"` to `package.json`.

## Repo conventions to capture in plans (when relevant)

- Initialize `Logger` in CLI entry points and pass it into clients/pipelines via constructor options.
- Use Zod schemas for CLI args and tool IO; name the schema files in the plan.
- Prefer TypeScript path aliases like `~tools/*`, `~clients/*`, `~utils/*` over deep relative imports.
- Avoid `index.ts` barrel exports; use explicit module paths.
- For HTTP fetching, prefer sanitized `Fetch` or `PlaywrightScraper` as appropriate.
- Any file-touching tool must use path validation from `src/tools/utils/fs.ts`.

## Required sections in every ExecPlan

Use these headings, in this order, and keep them up to date:

1. **Purpose / Big Picture** — what the user gains and how they can see it working.
2. **Progress** — checklist with timestamps (UTC), split partial work into “done” vs “remaining”.
3. **Surprises & Discoveries** — unexpected behaviors or constraints with short evidence.
4. **Decision Log** — decision, rationale, date/author.
5. **Outcomes & Retrospective** — what was achieved, gaps, lessons learned.
6. **Context and Orientation** — repo-specific orientation and key files.
7. **Conventions and Contracts** — logging, schemas, imports, and tool safety expectations.
8. **Plan of Work** — prose describing edits, with precise file paths and locations.
9. **Concrete Steps** — exact commands to run (cwd included) and expected short outputs.
10. **Validation and Acceptance** — behavioral acceptance and tests; name new tests.
11. **Idempotence and Recovery** — how to rerun safely; rollback guidance if needed.
12. **Artifacts and Notes** — concise transcripts, diffs, or snippets as indented blocks.
13. **Interfaces and Dependencies** — required modules, types, function signatures, and why.

## Formatting rules

- The ExecPlan is a normal Markdown document (no outer code fence).
- Prefer prose over lists; the only mandatory checklist is in **Progress**.
- Define any non-obvious term the first time you use it.
- Use repo-relative paths and exact function/module names.
- Do not point to external docs; embed the needed context in the plan itself.

## Validation defaults for this repo

State which of these apply, and include expected outcomes:

- `pnpm typecheck`
- `pnpm lint` (or `pnpm lint:fix` if auto-fixing is intended)
- `pnpm test`
- `pnpm format:check` (if formatting changes)

If the change affects a CLI, include a concrete CLI invocation and expected output.

## ExecPlan skeleton (copy and fill)

    # <Short, action-oriented title>

    This ExecPlan is a living document. Update **Progress**, **Surprises & Discoveries**, **Decision Log**, and **Outcomes & Retrospective** as work proceeds.

    ## Purpose / Big Picture

    Describe the user-visible behavior and how to observe it.

    ## Progress

    - [ ] (2026-01-25 00:00Z) Example incomplete step.

    ## Surprises & Discoveries

    - Observation: …
      Evidence: …

    ## Decision Log

    - Decision: …
      Rationale: …
      Date/Author: …

    ## Outcomes & Retrospective

    Summarize results, gaps, and lessons learned.

    ## Context and Orientation

    Explain the relevant parts of `src/cli/...`, shared helpers, and tools.

    ## Conventions and Contracts

    Call out logging, Zod schemas, imports, and any tool safety expectations.

    ## Plan of Work

    Prose description of edits with precise file paths and locations.

    ## Concrete Steps

    State commands with cwd and short expected outputs.

    ## Validation and Acceptance

    Behavioral acceptance plus test commands and expectations.

    ## Idempotence and Recovery

    How to rerun safely and roll back if needed.

    ## Artifacts and Notes

    Short transcripts, diffs, or snippets as indented blocks.

    ## Interfaces and Dependencies

    Required types/modules/functions and why they exist.
