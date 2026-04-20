# GoodMemory Current Status and Evidence

This document is the stable entrypoint for the current repo state.
It summarizes what is public, what remains internal, and which evidence artifacts are the canonical places to audit today.
It intentionally replaces phase-by-phase navigation at the top level of `README.md` and `docs/`.

## Stable OSS Surface

- Public memory API remains centered on `createGoodMemory`, `remember`, `recall`, `buildContext`, `feedback`, `forget`, `exportMemory`, and `deleteAllMemory`.
- `createGoodMemory({})` now defaults to auto storage resolution: explicit storage config wins as one source; otherwise Postgres is preferred only when a configured target can bootstrap the GoodMemory backend, and local SQLite is the fallback.
- The official CLI surface remains memory-first: `goodmemory inspect`, `trace`, `export-memory`, `stats`, plus nested eval inspection commands.
- Host integration stays on the explicit adapter path; `file-assisted` remains the recommended default mode for Claude/Codex-style consumption.
- `sqlite` is now stable as the default local durable document/session/vector backend for the auto-storage path.
- `GOODMEMORY_EMBEDDING_*` now controls automatic embedding enablement; when those variables are absent, runtime behavior stays `rules-only`.
- Local SQLite runtime guardrails are available through `GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH`, `GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH`, and `GOODMEMORY_SQLITE_VECTOR_MODE=off|prefer|require`.
- Configured SQLite vector extensions can now participate in the search path, but the stable product claim is still “durable local vectors with optional extension-assisted search”, not full `sqlite-vss` indexed acceleration by default.
- Retrieval rollout controls, promotion gates, salvage hooks, and internal provider-router rollout controls remain implementation detail, not README-level product surface.
- Implicit behavioral adaptation eval is internal evidence infrastructure; it does not change the stable OSS runtime surface.
- Behavioral adaptation outcome telemetry and deterministic Layer D evidence are also internal evidence infrastructure; they do not change the stable OSS runtime surface.

## Latest Closed Slice

- Phase 26 is now closed as the post-Phase-25 local-first runtime slice.
- Accepted behavior:
  - default storage resolution with explicit-over-auto precedence and no provider/url cross-source mixing
  - durable local SQLite vectors as the default local fallback
  - SQLite runtime bootstrap/guardrails and optional extension-assisted search
  - CLI/runtime storage-resolution alignment
  - automatic embeddings only when `GOODMEMORY_EMBEDDING_*` is configured; otherwise `rules-only`
- Still outside the accepted Phase 26 claim:
  - promoting `sqlite-vss` indexed acceleration as the canonical default backend
  - provider-backed live-memory acceptance evidence for this local-first slice

## Current Canonical Evidence

- Deterministic integrated acceptance:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-20-Quality-Gate.md`
  - Report: `reports/quality-gates/phase-20/run-20260420023503/phase-20-quality-gate.json`
- Provider-backed recall-router hardening and promotion-readiness evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-22-Quality-Gate.md`
  - Deterministic report: `reports/quality-gates/phase-22/run-20260420020541/phase-22-quality-gate.json`
  - Live-memory observe report: `reports/eval/live-memory/phase-22/run-1776650772564-observe/report.json`
  - Live-memory assist report: `reports/eval/live-memory/phase-22/run-1776650772564-assist/report.json`
- Internal recall-router controlled default-promotion evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-23-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-23/run-20260420061039/phase-23-quality-gate.json`
  - Live-memory promote report: `reports/eval/live-memory/phase-23/run-1776658376536-promote/report.json`
  - Deterministic fallback promote report: `reports/eval/fallback/phase-23/run-1776658356917-promote/report.json`
- Implicit behavioral adaptation eval-harness evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-24-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-24/run-20260420154540-contrastive-fix/phase-24-quality-gate.json`
  - Deterministic fallback report: `reports/eval/fallback/phase-24/run-20260420154540-contrastive-fix/report.json`
- Behavioral adaptation deterministic runtime and outcome-telemetry evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-25-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-25/run-20260420082358/phase-25-quality-gate.json`
  - Deterministic fallback report: `reports/eval/fallback/phase-25/run-1776673441250/report.json`
  - Live-memory behavioral closure is not yet a canonical accepted artifact for this slice.
- Local-first runtime closure evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-26-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-26/run-20260420193000/phase-26-quality-gate.json`
- Historical v1 snapshot:
  - `docs/GoodMemory-v1-Quality-Gate.md`

## How To Navigate

- Use `README.md`, `docs/GoodMemory-PRD.md`, and the architecture docs when you need the product story or public integration shape.
- Use `task-board/00-README.txt` when you need execution order, closed/open slices, or explicit reopen rules for future work.
- Use `docs/archive/quality-gates/README.md` when you need historical closure detail for a specific capability slice.
- Use `reports/quality-gates/` and `reports/eval/` when you need raw evidence rather than a summarized judgment.

## Scope Boundary

- Top-level docs should stay product-oriented and current-state-oriented.
- Phase history is preserved, but it now lives in the archive layer instead of the main documentation surface.
