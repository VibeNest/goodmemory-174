# Repository Guidelines

## Project Structure & Module Organization

Treat this file as a routing layer, not the final authority. The design corpus is cataloged through `docs/` and the execution index in `task-board/00-README.txt`. When you need product intent, architecture, verification status, or gap tracking, follow the deeper sources below.

```text
README.md
docs/
├── GoodMemory-First-Principles-and-Reference-Architecture.md  # canonical design, core beliefs, operating principles
├── GoodMemory-OSS-Architecture-v1.md                          # top-level map of domains, packages, and boundaries
├── GoodMemory-PRD.md                                          # product scope and behavior contract
├── GoodMemory-TDD-and-Evaluation-Strategy.md                  # test pyramid, eval design, fixture strategy
├── GoodMemory-v1-Quality-Gate.md                              # latest recorded verification snapshot
├── GoodMemory-v1-Release-Checklist.md                         # release readiness checklist
├── GoodMemory-Unified-Self-Evolving-Roadmap.md                # canonical roadmap after the v1 core
├── GoodMemory-记忆数据分层设计.md                               # layering and storage reference
└── documents/                                                 # research/reference corpus

task-board/
├── 00-README.txt                                              # canonical execution order, status markers, working rules
├── 01-phase-0-...txt -> 19-phase-18-...txt                    # phase-level execution plan
└── phase-*/00-README.txt                                      # per-phase breakdown and acceptance criteria

adr/
├── ADR-001-memory-taxonomy.txt
├── ADR-002-public-api.txt
├── ADR-003-runtime-context-controls.txt
└── ADR-004-maintenance-engine.txt

src/
├── index.ts                                                   # public package surface
├── api/                                                       # createGoodMemory entrypoint and API contracts
├── domain/                                                    # taxonomy, scope, provenance, core records
├── remember/                                                  # write path: extraction, classification, candidate handling
├── recall/                                                    # retrieval planning, scoring, selection, context assembly
├── runtime/                                                   # session-scoped context services and spillover controls
├── maintenance/                                               # decay, dream, consolidation, and maintenance runners
├── verify/                                                    # verification policy for stale or inferred memory
├── storage/                                                   # in-memory, sqlite, postgres, and repository adapters
├── eval/                                                      # eval runners, judge integration, reporting
├── evidence/ evolution/ governance/                           # evidence, archive, proposal, and governance layers
├── embedding/ provider/                                       # provider-backed adapters and model plumbing
├── language/                                                  # locale-aware extraction and normalization
├── policy/ testing/                                           # policy hooks and shared test helpers
└── cli.ts                                                     # CLI entrypoint exposed via package exports

tests/
├── unit/ integration/ scenarios/ eval/                        # canonical red/green layers
├── cli/ examples/ release/ types/                             # CLI, example, packaging, and type-surface regressions
└── ...

fixtures/
├── personas/eval/ and scenarios/eval/                         # eval personas and replay cases
├── conversations/ personas/ rubrics/ scenarios/               # supporting fixture sources
└── ...

reports/eval/
├── fallback/                                                  # deterministic validation artifacts
├── live/                                                      # live model eval artifacts with in-memory memory backend
└── live-memory/                                               # provider-backed live-memory eval artifacts

scripts/ and examples/ hold developer utilities, CLI/eval runners, and reference integrations.
```

Use `docs/GoodMemory-First-Principles-and-Reference-Architecture.md` for product principles, `docs/GoodMemory-OSS-Architecture-v1.md` for module boundaries, `task-board/00-README.txt` for execution order, and `docs/GoodMemory-v1-Quality-Gate.md` plus `reports/eval/` for verification evidence. Scored quality and gap tracking live in the phase board and generated eval artifacts, not in `AGENTS.md`.

## Build, Test, and Development Commands

- `bun test`: run the canonical repository suite rooted at `tests/` via `bunfig.toml`; this is the default red/green path in local work and CI.
- `bun run test:all`: sweep `tests/` plus vendored `third-party/` trees with the broad-root Bun config when you intentionally want the wider pass.
- `bun run test:watch`: rerun the canonical suite during local development.
- `bun run test:coverage`: run the canonical suite with coverage gates, then enforce script/source coverage via `scripts/check-coverage.ts`.
- `bun run typecheck`: run strict TypeScript checks with `tsc --noEmit`.
- `bun run eval:smoke`: verify eval wiring without live model calls.
- `bun run eval:fallback`: run the deterministic fixture-based eval path and write reports to `reports/eval/fallback/`.
- `bun run eval:live`: run the live generator + live judge eval path with the in-memory memory backend and write reports to `reports/eval/live/`.
- `bun run eval:live-memory`: run the provider-backed live eval path with Postgres storage, embeddings, and assisted extraction; write reports to `reports/eval/live-memory/`. This needs the live eval/judge env vars plus `GOODMEMORY_TEST_POSTGRES_URL`, `GOODMEMORY_EMBEDDING_*`, and `GOODMEMORY_ASSISTED_EXTRACTOR_*`.
- `bun run eval:summary`: summarize existing eval output directories.
- `bun run fixtures:generate`: regenerate eval fixtures under `fixtures/`.

There is no separate build step today; contributors work directly against Bun + TypeScript sources.

## Coding Style & Naming Conventions

Use TypeScript with ESM imports, strict typing, and ASCII by default. Follow the existing style: 2-space indentation, semicolons, trailing commas, and descriptive factory names such as `createGoodMemory`, `createRecallEngine`, and `createPostgresDocumentStore`. Prefer small, focused modules and explicit named exports. There is no dedicated lint script yet, so match nearby files closely. Use `*.test.ts` for test files and keep shared helpers under `src/testing/` or suite-local helpers inside `tests/`.

## Testing Guidelines

TDD is mandatory here: add a failing test first, then implement. Put pure logic in `tests/unit/`, API and storage flows in `tests/integration/`, replay coverage in `tests/scenarios/`, product-level regressions in `tests/eval/`, and CLI/package/type-surface checks in `tests/cli/`, `tests/examples/`, `tests/release/`, and `tests/types/`. Live Postgres coverage requires `GOODMEMORY_TEST_POSTGRES_URL`; otherwise those suites are skipped. Provider-backed live-memory evals also require the embedding and assisted-extractor env vars described above. Run `bun test` and `bun run typecheck` before opening a PR; use `bun run test:coverage` for release-facing changes.

## Commit & Pull Request Guidelines

Recent history uses imperative, scoped commit subjects, for example `Enhance evaluation framework with strategy support and reporting improvements` and `Implement router strategy framework and enhance recall decision-making`. Keep new subjects similarly specific. PRs should include a concise summary, linked task-board item or ADR when relevant, and the commands you ran. If a change touches Postgres, fixtures, or eval output, note the environment used and whether `reports/eval/` changes are intentional.
