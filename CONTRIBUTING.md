# Contributing

## Engineering Rules

- Runtime is Bun.
- Language is TypeScript.
- Module format is ESM.
- TDD is mandatory.
- Every feature starts with failing tests.
- Public API simplicity takes priority over internal abstraction purity.
- ASCII is the default character set for source files unless there is a clear reason otherwise.

## Test Layers

- `tests/unit/` for pure logic
- `tests/integration/` for API chain behavior
- `tests/scenarios/` for persona replay
- `tests/eval/` for product evaluation scaffolding

## Main Commands

- `bun test`
- `bun run typecheck`
- `bun run eval:smoke`

## Postgres Validation

- Live Postgres tests are gated by `GOODMEMORY_TEST_POSTGRES_URL`.
- Put local settings in `.env` and start from `.env.example`.
- Bun will load `.env` automatically for `bun test`.
- Without that environment variable, the Postgres integration suites are skipped and the default test run stays green.
- The target database must allow `CREATE EXTENSION vector` or already have the `vector` extension installed.
- Example:
  - `cp .env.example .env`
  - `bun test`

## Source of Truth

Before changing product or architecture direction, check:

- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-TDD-and-Evaluation-Strategy.md`
- `docs/GoodMemory-OSS-Architecture-v1.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `task-board/`
