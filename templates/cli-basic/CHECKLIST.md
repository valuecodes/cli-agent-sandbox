# Post-Scaffold Checklist

## Setup

- [ ] Update `main.ts` with CLI logic
- [ ] Add CLI arguments to the Zod schema
- [ ] Update `README.md` description and flowchart

## Optional Structure

- [ ] Create `./clients/` for pipeline/client classes
- [ ] Create `./types/` for Zod schemas
- [ ] Create `./tools/` for CLI-specific agent tools

## Before Committing

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] Add tests if behavior is testable
- [ ] `pnpm test`

## Cleanup

- [ ] Delete this CHECKLIST.md when done
