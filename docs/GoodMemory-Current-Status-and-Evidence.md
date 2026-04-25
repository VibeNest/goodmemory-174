# GoodMemory Current Status and Evidence

This document is the stable entrypoint for the current repo state.
It summarizes what is public, what remains internal, and which evidence artifacts are the canonical places to audit today.
It intentionally replaces phase-by-phase navigation at the top level of `README.md` and `docs/`.

## Stable OSS Surface

- Public memory API remains centered on `createGoodMemory`, `remember`, `recall`, `buildContext`, `feedback`, `forget`, `exportMemory`, and `deleteAllMemory`.
- Public domain write customization is now accepted through `GoodMemoryConfig.remember`, `RememberProfile`, `rememberRules`, `RememberInput.annotations`, and traceable extractor composition.
- `goodmemory`, `goodmemory/ai-sdk`, `goodmemory/host`, and `goodmemory/http` now resolve through compiled `dist/` artifacts and emitted type declarations on the packaged install surface.
- `createGoodMemory({})` now defaults to auto storage resolution: explicit storage config wins as one source; otherwise Postgres is preferred only when a configured target can bootstrap the GoodMemory backend; Bun keeps local SQLite as the zero-config durable fallback; Node zero-config runtime falls back to in-memory when the built-in local SQLite adapter is unavailable.
- `inspectGoodMemoryRuntime(memory)` now exposes the sanitized resolved storage/runtime plan so Node zero-config in-memory fallback is observable through the public API instead of being silent, unsupported built-in `sqlite` / `postgres` selections are reported as unavailable instead of durable, and injected storage adapters are reported as adapter-defined execution instead of being mislabeled as the configured built-in plan.
- The official CLI surface remains memory-first for stable read paths: `goodmemory inspect`, `trace`, `export-memory`, `stats`, plus nested eval inspection commands, and the installed-package invocation path is `./node_modules/.bin/goodmemory ...`. The package bin is Node-safe, `goodmemory -V` / `goodmemory --version` answer directly from package metadata, and non-version command execution is still Bun-backed today.
- Phase 35 installed host-memory middleware is now part of the accepted stable host surface through `goodmemory setup`, `goodmemory status`, `goodmemory install|uninstall <codex|claude>`, `goodmemory enable|disable <codex|claude>`, `SessionStart` / `UserPromptSubmit` hooks, read-only MCP, and explicit write CLI commands. Interactive setup now defaults to global activation with workspace-derived isolation, prompts for optional Postgres, embedding, LLM extraction, and installed-host writeback mode, recommends `observe` for new host configs, preserves existing writeback mode when the interactive prompt default is accepted, keeps `--json` / `--no-interactive` script-safe, and still lets users skip provider setup and add it later in `~/.goodmemory/<host>.json`.
- Phase 35 is now closed as the installed host-memory middleware and hooks slice.
- Phase 37 is now closed as the installed host selective writeback slice. Codex installed host supports opt-in `off` / `observe` / `selective` writeback through `goodmemory codex writeback`, `install|enable --writeback`, and `session-stop` delegation. Runtime config defaults and new scripted installs remain `off` unless explicitly changed; existing configs keep their current writeback mode when no explicit override is provided; new interactive installs recommend `observe`. `observe` stores bounded/redacted candidate previews for review without durable writes; `selective` writes only selected candidates through the public Phase 36 `remember` surface.
- Phase 37.1 is now closed as installed-host writeback productization polish. It adds audit/undo CLI surfaces through `goodmemory codex writeback inspect` and `goodmemory codex writeback forget --event-id`, a v4 audit ledger with bounded redacted previews, observe-only `observed` / `dismissed` events, and typed linked records, deterministic fixture-backed dogfood evidence for clean CI, local real-ledger dogfood mode for follow-up validation, and a Phase 37.1 quality gate. It does not change the Phase 37 accepted claim: writeback remains opt-in, no raw transcript archive is added, and no root public writeback API is introduced.
- Phase 38 is now closed as the governed runtime surface slice. The accepted surface includes `GoodMemoryConfig.observability.traceSink` plus redaction-safe typed `GoodMemoryTraceSpan` emissions for the core public memory API, private keyed scope digests by default, targeted `reviseMemory()` for governed correction by explicit `memoryId`, a `memory.runtime.*` facade on the `createGoodMemory()` result with summary-only archive persistence explicit and off by default, an explicit in-memory `memory.jobs.*` scheduler for background remember writes, `GoodMemoryConfig.providers.embedding` / `providers.extraction` as a facade over the existing provider adapter resolver, and thin Express/Fastify HTTP examples at `examples/express-chat-server.ts` and `examples/fastify-chat-server.ts` that use the governed runtime and jobs surface without framework coupling.
- Phase 39 is now closed as the Python HTTP integration bridge slice. The accepted public surface is `goodmemory/http` plus the packaged `goodmemory-http-bridge` server bin for Python/FastAPI consumers, with `POST /memory/recall-context`, `remember`, `feedback`, `export`, `forget`, and targeted `revise` endpoints built only on public GoodMemory APIs, scoped authorization for export/forget/revise, bearer-token server startup by default, bridge-level async remember through `memory.jobs.*`, a life-coach reference profile without a built-in OneLife preset, and Python process smoke coverage at `examples/python-fastapi-memory-consumer.py`.
- Installed-package external host wiring remains available through `goodmemory codex bootstrap` and `goodmemory claude bootstrap` as lower-level compatibility scaffolding for artifact-first integrations.
- Host integration stays on the explicit adapter/package path; hook-injected recall is the canonical always-on middleware path for enabled repositories or globally activated workspaces, while MCP is a deep-read/debug surface rather than the default recall transport.
- Installed-host writeback does not persist raw transcripts. Assistant-originated durable memory remains blocked unless host annotations confirm or verify it and the active profile policy allows it. `remember: "never"` masks content before deterministic, custom, or assisted extraction. Observe-mode audit events do not enter the committed/pending dedupe sets, so they do not block later `selective` writes. Cross-store exactly-once transactions between memory storage and the writeback JSON ledger remain outside the accepted claim; the accepted runtime uses a pending/committed ledger for repair-visible idempotency and reports uncommitted writes as `write_failed`.
- `goodmemory/host` now includes an explicit pre-action contract through `HostActionIntent`, `HostActionAssessmentResult`, `HostActionDecision`, `HostAdapter.assessAction()`, and `resolveHostActionExecutionPlan()`.
- Optional adapter-level agent-event ingestion now exists on `goodmemory/ai-sdk` and `goodmemory/host`; no new root `goodmemory/evolution` module was added.
- root `goodmemory` no longer re-exports internal evolution contracts; proposal, reviewer, compiler, and maintenance internals stay outside the stable root API.
- automatic adapter/event `user_correction` path is proposal-first and records selective evidence plus proposal/promotion receipts instead of writing an intermediate active feedback memory; public `feedback()` remains the explicit durable procedural feedback entrypoint.
- `sqlite` remains the stable default local durable document/session/vector backend on Bun.
- Generic live-memory eval semantics are now auto-storage aligned across both CLI and script helpers:
  - `bun run eval:live-memory` and `runLiveMemoryEval()` follow the normal runtime storage resolver, so default local SQLite remains valid and configured Postgres becomes provider-backed.
  - `bun run eval:live-provider-memory` and `runLiveProviderMemoryEval()` are the explicit provider-backed entrypoints when silent fallback would invalidate evidence.
- Historical phase-specific provider-backed evidence still lives under `reports/eval/live-memory/phase-*`; those paths come from dedicated phase runners and should not be confused with the current generic `eval:live-memory` CLI contract.
- `GOODMEMORY_EMBEDDING_*` now controls automatic embedding enablement; when those variables are absent, runtime behavior stays `rules-only`.
- Local SQLite runtime guardrails are available through `GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH`, `GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH`, and `GOODMEMORY_SQLITE_VECTOR_MODE=off|prefer|require`.
- Supported local runtimes can now auto-upgrade the SQLite semantic path to a real `sqlite-vss` indexed backend; unsupported runtimes stay on the accepted durable fallback path and must not claim acceleration.
- Retrieval rollout controls, promotion gates, salvage hooks, and internal provider-router rollout controls remain implementation detail, not README-level product surface.
- Implicit behavioral adaptation eval is internal evidence infrastructure; it does not change the stable OSS runtime surface.
- Behavioral adaptation outcome telemetry and deterministic Layer D evidence are also internal evidence infrastructure; they do not change the stable OSS runtime surface.
- Trace-backed behavioral enactment over the accepted Codex host path is internal evidence infrastructure; it does not widen the public `GoodMemory` API, public config, or README-level default behavior.

## Latest Closed Slice

- Phase 39 is now closed as the Python HTTP integration bridge slice.
- Accepted behavior:
  - `docs/GoodMemory-Python-HTTP-Integration-Bridge.md` freezes the backend-only HTTP contract and deployment path for Python/FastAPI consumers
  - `goodmemory/http` exports the public bridge API, while `examples/support/http-memory-bridge.ts` is only a local compatibility re-export
  - `goodmemory-http-bridge` starts the packaged bridge server and refuses tokenless startup unless explicitly configured for local insecure mode
  - `POST /memory/recall-context` returns prompt-ready context plus compact structured items for consumer context shapes
  - `POST /memory/remember` exposes `mode: "sync" | "async"` as bridge transport control only; async writes route through `memory.jobs.enqueueRemember()`
  - `POST /memory/feedback` remains procedural feedback with explicit consumer provenance rather than a catch-all fact write
  - `POST /memory/export`, `/memory/forget`, and `/memory/revise` require scoped authorization; the default bridge authorizer rejects broadened tenant/workspace scopes
  - `/memory/revise` wraps only targeted `reviseMemory({ target: { memoryId } })` and rejects query-resolved correction targets
  - `createLifeCoachHttpRememberConfig()` is reference public `remember` config, not a built-in OneLife preset
  - `examples/python-fastapi-memory-consumer.py` proves a Python process can call both the bridge API server and packaged bridge server over HTTP
- Canonical evidence:
  - contract doc: `docs/GoodMemory-Python-HTTP-Integration-Bridge.md`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-39-Quality-Gate.md`
  - quality gate: `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`
  - Phase 38 hermetic preflight evidence is written under `.tmp-goodmemory-phase39/` so Phase 39 keeps the prior Phase 38/37.1 gate chain without mutating accepted artifacts
- Still outside the Phase 39 accepted claim:
  - client-side GoodMemory runtime bundling
  - built-in OneLife preset
  - query-resolved correction targets
  - `remember({ mode: "background" })`
  - consumer-side lock or "do not remember this" as a native bridge mutation
  - default raw transcript archive
  - managed cloud, dashboard, hosted sync, or cross-service exactly-once claims

## Active Follow-Up Slice

- Phase 40 is now active as the v0.2 release proof and product eval slice.
- It started from the accepted Phase 39 Python HTTP bridge evidence:
  `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`
  and `docs/archive/quality-gates/GoodMemory-Phase-39-Quality-Gate.md`.
- P40-T001 through P40-T003 are implemented: the README App Quickstart now shows
  the current runtime/recall/context/jobs loop, and the canonical guide is
  `docs/GoodMemory-15-Minute-App-Integration.md`; package metadata and public
  install docs now agree on `0.2.0`, and CI package-boundary coverage includes
  Node 20, Node 22, and Node 24.
- Planned scope:
  - README and canonical 15-minute app integration guide around the current app
    loop
  - v0.2 package and release proof, including external tarball consumer smoke
    and Node 20 / 22 / 24 package-boundary smoke
  - cross-consumer adoption smoke for direct TypeScript, Express/Fastify,
    Python/FastAPI bridge, and installed-host paths
  - product eval rollup comparing with-GoodMemory against a no-memory baseline
    for identity/background understanding and historical task continuation
- Phase 40 must not add query-resolved revise targets, raw CRUD APIs,
  `remember({ mode: "background" })`, public router provider config, dashboard,
  managed cloud, default-on writeback, raw transcript archive, or a built-in
  OneLife preset.

## Prior Closed Installed-Host Slices

- Phase 37.1 is now closed as installed-host writeback productization polish.
- Accepted behavior:
  - `goodmemory codex writeback inspect --json` lists scope-filtered writeback audit events
  - `goodmemory codex writeback forget --event-id <id>` deletes typed linked records through public `forget()` before marking durable audit events forgotten, and dismisses observe-only events without calling `forget()`
  - Claude has deterministic CLI parity for inspect and forget
  - the v4 audit ledger remains compatible with Phase 37 `{ events, pending }` ledgers and keeps observe-only `observed` / `dismissed` events out of committed/pending dedupe
  - dogfood summary reports candidate count, durable write count, forgotten count, duplicate count, next-session recall hit count, session count, and manual false-write rate without raw conversation content
  - `gate:phase-37-1` uses deterministic fixture-backed dogfood evidence by default so clean CI does not depend on local `~/.goodmemory` history
  - `gate:phase-37-1 -- --dogfood-mode local` keeps the real local ledger path available for longer dogfood validation
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-37.1-Quality-Gate.md`
  - dogfood report: `reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json`
  - quality gate: `reports/quality-gates/phase-37-1/run-20260424100757/phase-37-1-quality-gate.json`
- Still outside the Phase 37.1 accepted claim:
  - default-on writeback
  - transcript archive
  - dashboard or managed cloud
  - widening the root public API
  - claiming long-running 20-50 real-session dogfood retention results

- Phase 37 is now closed as the installed host selective writeback slice.
- Accepted behavior:
  - Codex installed host supports opt-in writeback modes: `off`, `observe`, and `selective`
  - runtime config defaults and new scripted installs remain `off` unless explicitly changed
  - existing configs keep their current writeback mode when no explicit override is provided
  - new interactive setup/install recommends `observe` for new host configs and keeps existing writeback mode when the prompt default is accepted
  - `observe` stores local bounded/redacted candidate previews for review without raw transcript or durable memory writes
  - `selective` writes durable memory only through the accepted public `remember` surface, with installed-host profiles, rules, annotations, and trace metadata
  - no raw transcript is persisted as durable memory
  - assistant-originated durable memory is ignored unless host annotation confirms or verifies it and the active profile allows it
  - `remember: "never"` masks content before deterministic, custom, or assisted extraction
  - duplicate open-loop writeback is suppressed through stable writeback candidate keys and the pending/committed ledger
  - a two-session Codex scenario works without manual `goodmemory remember`: session 1 writes an open loop, session 2 recalls it through `UserPromptSubmit`
  - provider-backed assisted extraction ran through the installed-host writeback runtime, while durable storage remained the accepted local SQLite fallback in the canonical live report
  - an external consumer installed the packed package and completed writeback plus next-session recall outside this repository
- Still outside the accepted Phase 37 claim:
  - default-on automatic writeback
  - full transcript archive or transcript persistence as memory
  - dashboard
  - managed cloud
  - built-in OneLife preset
  - reopening recall routing or retrieval profile promotion
  - making Claude a second provider-backed live blocker
  - cross-store exactly-once transaction between memory storage and the JSON writeback ledger

## Current Follow-Up Validation

- Long-running real-use dogfood remains useful but is no longer a Phase 37.1 closure blocker.
- Recommended follow-up:
  - run Codex with installed-host writeback enabled in normal coding sessions
  - periodically run `bun run eval:phase-37-1-dogfood -- --run-id run-phase37-1-local --output-dir <path>`
  - use `bun run gate:phase-37-1 -- --dogfood-mode local` when the real local ledger has enough sessions to validate retention behavior beyond the deterministic CI fixture; local mode writes to `.tmp-goodmemory-phase37-1-local/` by default so canonical evidence is not overwritten

## Current Canonical Evidence

Fallback eval outputs under `reports/eval/fallback/**` are deterministic, regenerable local outputs. They are intentionally ignored by Git; tracked quality-gate artifacts record the run id, regeneration command, and ignored output path instead of treating fallback reports as checked-in audit artifacts.

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
  - Deterministic fallback promote replay output (ignored generated): `reports/eval/fallback/phase-23/run-1776658356917-promote/report.json`
- Implicit behavioral adaptation eval-harness evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-24-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-24/run-20260420154540-contrastive-fix/phase-24-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-24/run-20260420154540-contrastive-fix/report.json`
- Behavioral adaptation deterministic runtime and outcome-telemetry evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-25-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-25/run-20260420082358/phase-25-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-25/run-1776673441250/report.json`
  - Live-memory behavioral closure is not yet a canonical accepted artifact for this slice.
- Local-first runtime closure evidence:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-26-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-26/run-20260420193000/phase-26-quality-gate.json`
- Reference-integration and adoption-evidence closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-27-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-27/run-20260421172000/phase-27-quality-gate.json`
  - Deterministic adoption replay output (ignored generated): `reports/eval/fallback/phase-27/run-20260421165000/report.json`
  - Live-memory adoption eval: `reports/eval/live-memory/phase-27/run-20260421170500/report.json`
- Canonical local sqlite-vss backend closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-28-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-28/run-20260421093000/phase-28-quality-gate.json`
- Historical Bun-only release-hardening closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-29-Quality-Gate.md`
  - Deterministic gate: `reports/quality-gates/phase-29/run-20260421213000/phase-29-quality-gate.json`
  - RC dry run report: `reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json`
- Trace-backed behavioral enactment and live closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-30-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-30/run-20260421153410/phase-30-quality-gate.json`
  - Provider-backed live-memory behavioral report: `reports/eval/live-memory/phase-30/run-phase30-live-current/report.json`
- Native host outcome and correction closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-31-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-31/run-20260422041616/phase-31-quality-gate.json`
  - Provider-backed live-memory behavioral report: `reports/eval/live-memory/phase-31/run-phase31-live-current/report.json`
- External host-integration productization closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-32-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-32/run-20260422085720/phase-32-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-32/run-20260422173045/report.json`
  - Codex external-host live report: `reports/eval/live-memory/phase-32/run-phase32-live-current/report.json`
- Node-compatible package-boundary and Node-first integration closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-33-Quality-Gate.md`
  - Quality gate: `reports/quality-gates/phase-33/run-20260422212752/phase-33-quality-gate.json`
- Host pre-action policy and veto-contract closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-34-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-34/run-20260422213045/report.json`
  - Codex action-gate live report: `reports/eval/live-memory/phase-34/run-phase34-live-current/report.json`
- Installed host-memory middleware and hooks closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-35-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-35/run-20260423173045/report.json`
  - Codex installed middleware live report: `reports/eval/live-memory/phase-35/run-phase35-live-current/report.json`
- Public domain write profiles and rules closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-36-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-36/run-20260423223045/phase-36-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-36/run-20260423221045/report.json`
  - Provider-backed live-memory report: `reports/eval/live-memory/phase-36/run-phase36-live-current/report.json`
- Installed host selective writeback closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-37-Quality-Gate.md`
  - Deterministic/live gate: `reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json`
  - Deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-37/run-20260424101045/report.json`
  - Provider-backed assisted-extraction live-memory report: `reports/eval/live-memory/phase-37/run-phase37-live-current/report.json`
  - External consumer installed-package smoke report: `reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json`
- Installed host writeback productization polish closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-37.1-Quality-Gate.md`
  - Dogfood report: `reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json`
  - Quality gate: `reports/quality-gates/phase-37-1/run-20260424100757/phase-37-1-quality-gate.json`
- Governed runtime surface closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-38-Quality-Gate.md`
  - Quality gate: `reports/quality-gates/phase-38/run-20260425084045/phase-38-quality-gate.json`
- Python HTTP integration bridge closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-39-Quality-Gate.md`
  - Contract doc: `docs/GoodMemory-Python-HTTP-Integration-Bridge.md`
  - Quality gate: `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`
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
