# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the library code, organized by capability: `domain/` for core types and rules, `remember/` and `recall/` for memory pipelines, `runtime/` and `maintenance/` for context management, `storage/` for providers, `verify/` for policy checks, and `eval/` for scoring/reporting. `src/index.ts` is the public API surface. `tests/` mirrors the runtime layers with `unit/`, `integration/`, `scenarios/`, and `eval/`. `fixtures/` stores persona and scenario JSON, `scripts/` holds developer utilities, and `docs/`, `adr/`, and `task-board/` are the architecture source of truth. `reports/eval/` is generated output; only commit it when you are intentionally updating eval artifacts.

## Build, Test, and Development Commands
- `bun test`: run the full test suite.
- `bun test --watch`: rerun tests during local development.
- `bun run typecheck`: run strict TypeScript checks with `tsc --noEmit`.
- `bun run eval:smoke`: verify eval wiring without live model calls.
- `bun run eval:full`: run the fixture-based evaluation suite and write JSON reports to `reports/eval/`.
- `bun run fixtures:generate`: regenerate eval fixtures under `fixtures/`.

There is no separate build step today; contributors work directly against Bun + TypeScript sources.

## Coding Style & Naming Conventions
Use TypeScript with ESM imports, strict typing, and ASCII by default. Follow the existing style: 2-space indentation, semicolons, trailing commas, and descriptive factory names such as `createRecallEngine` and `createPostgresDocumentStore`. Prefer small, focused modules and explicit named exports. There is no dedicated lint script yet, so match nearby files closely. Use `*.test.ts` for test files and keep shared helpers under `src/testing/` or suite-local helpers inside `tests/`.

## Testing Guidelines
TDD is mandatory here: add a failing test first, then implement. Put pure logic in `tests/unit/`, API and storage flows in `tests/integration/`, replay coverage in `tests/scenarios/`, and product-level regressions in `tests/eval/`. Live Postgres coverage requires `GOODMEMORY_TEST_POSTGRES_URL`; otherwise those suites are skipped. Run `bun test` and `bun run typecheck` before opening a PR.

## Commit & Pull Request Guidelines
Git history is currently minimal (`Initial commit`), so keep commit subjects short, imperative, and specific, for example `Add sqlite session store tests`. PRs should include a concise summary, linked task-board item or ADR when relevant, and the commands you ran. If a change touches Postgres, fixtures, or eval output, note the environment used and whether `reports/eval/` changes are intentional.
