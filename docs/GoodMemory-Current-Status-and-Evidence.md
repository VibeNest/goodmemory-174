# GoodMemory Current Status and Evidence

This is the compact current-truth entrypoint. Historical narrative has been removed from this file; use `docs/archive/quality-gates/README.md`, generated reports, and git history for phase-by-phase provenance. Product scope remains in `docs/GoodMemory-PRD.md`, and execution order remains in `task-board/00-README.txt`.

## Stable OSS Surface

- Current stable package line: v0.2.x.
- Public API remains centered on `createGoodMemory`, `remember`, `recall`, `buildContext`, `feedback`, `forget`, `exportMemory`, and `deleteAllMemory`.
- Package subpaths `goodmemory`, `goodmemory/ai-sdk`, `goodmemory/host`, `goodmemory/http`, and `goodmemory/runtime-kit` resolve through compiled `dist/` artifacts and emitted type declarations.
- Storage resolution is automatic: explicit config wins, configured Postgres can be used when bootstrap succeeds, Bun gets local SQLite, and unsupported Node zero-config local SQLite falls back to in-memory with observable runtime inspection.
- The official CLI uses the package bin. The global CLI invocation path is `goodmemory ...` after `npm install -g goodmemory`; project-local installs use `npx goodmemory`, `npm exec -- goodmemory`, or `./node_modules/.bin/goodmemory ...`. Non-version command execution remains Bun-backed today.
- Generic live-memory eval semantics are auto-storage aligned: `eval:live-memory`, `eval:live-auto-memory`, `runLiveMemoryEval()`, `eval:live-provider-memory`, and historical `reports/eval/live-memory/phase-*` paths keep their existing meanings.

## Installed Host And Runtime Surface

- Phase 35 installed host-memory middleware is now part of the accepted stable host surface. Phase 35 is now closed as the installed host-memory middleware and hooks slice. Accepted commands and hooks include `goodmemory setup`, `goodmemory status`, `SessionStart` / `UserPromptSubmit` hooks, and managed Codex/Claude install/enable/disable flows.
- Phase 37 is now closed as the installed host selective writeback slice: `goodmemory codex writeback`, runtime defaults off unless explicitly changed, and new interactive installs recommend `observe`.
- Phase 37.1 is now closed as installed-host writeback productization polish: `goodmemory codex writeback inspect`, audit/undo support, and observe/selective boundaries.
- Phase 38 is now closed as the governed runtime surface slice: `GoodMemoryConfig.observability.traceSink`, targeted `reviseMemory()`, `memory.runtime.*`, `memory.jobs.enqueueRemember()`, `GoodMemoryConfig.providers.embedding`, and `examples/express-chat-server.ts`.
- Phase 39 is now closed as the Python HTTP integration bridge slice. See `docs/GoodMemory-Python-HTTP-Integration-Bridge.md` and `examples/python-fastapi-memory-consumer.py`.
- Phase 41 is now closed as installed-host pre-action unification: `goodmemory codex hook pre-tool-use`, `goodmemory codex action`, and the installed action bridge share the installed memory backend.
- Phase 42 is now closed as the Progressive Recall Protocol slice.
- Phase 43 is now closed as the Runtime Kit slice: `goodmemory/runtime-kit`.
- Phase 43.5 is now closed as the Optional Runtime Worker slice: `goodmemory runtime worker drain-once`.
- Phase 50 is now closed as the Installer CLI Runtime-Shell Hardening slice: `goodmemory doctor [codex|claude|both]` and `goodmemory repair [codex|claude|both]`.
- Phase 51 is now closed as the Typed Behavioral Memory And Enactment slice; typed behavior is stored on compiled `validated_pattern` feedback.
- Phase 52 is now closed as the Structured Text-Response Enactment And Guarded Policy slice; guarded_policy remains internal.

## Public Boundary Notes

- root `goodmemory` no longer re-exports internal evolution contracts.
- automatic adapter/event `user_correction` path is proposal-first.
- automatic adapter/event `user_correction` path is proposal-first and records selective evidence plus proposal/promotion receipts instead of writing an intermediate active feedback memory; public `feedback()` remains the explicit durable procedural feedback entrypoint.
- Provider-backed retrieval is explicit; rules-only remains the default accepted mode, and provider failures surface as `provider_error`.
- Dashboard, cloud sync, and team workspace remain a Phase 48 no-go decision.
- Full ImplicitMemBench, LongMemEval, and BEAM reports are internal research evidence until explicitly promoted.

## Active Research Slice

- Phase 62 LongMemEval is accepted as the first Sequential Benchmark Hardening slice.
- Phase 63 BEAM is active and remains partial.
- Accepted LongMemEval close: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z` with 454/500 answer accuracy, evidence-session recall 0.9590, missed recall 35, wrong recall 6, wrong answers 46, and `executionFailures: 0`.
- Accepted BEAM smoke: `run-phase63-beam-smoke-current` and gate `run-20260518003000`.
- Latest accepted BEAM retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-ai-hiring-event-order-current-20260613T050930Z`, evidence-chat recall 0.881037335121842, missed 75/355, wrong-recall/noise 218/400, zero-recall 0, and hit/missing/noise ids 922/172/1160 -> 927/167/1133 (11:event_ordering:1 recovered from recall 0.17 to 1 and shed 28 noisy chats; three recall-neutral same-conversation noise swaps).

## Phase 40 Release Evidence

- Phase 40 is now closed as the v0.2 release proof and product eval slice.
- cross-consumer adoption smoke covers direct TypeScript, Express, Fastify, Python/FastAPI bridge, and installed-host package paths: `reports/eval/adoption/phase-40/run-20260425163012-cross-consumer/report.json`
- product eval rollup compares with-GoodMemory against a no-memory baseline: `reports/eval/product/phase-40/run-20260425165544-product-eval/report.json`
- Quality gate: `reports/quality-gates/phase-40/run-20260425172323/phase-40-quality-gate.json`

## Historical Evidence Index

This index keeps one-line evidence pointers instead of old narrative.

- Phase 20: `docs/archive/quality-gates/GoodMemory-Phase-20-Quality-Gate.md`, `reports/quality-gates/phase-20/run-20260420023503/phase-20-quality-gate.json`.
- Phase 22: `docs/archive/quality-gates/GoodMemory-Phase-22-Quality-Gate.md`, `reports/eval/live-memory/phase-22/run-1776650772564-assist/report.json`.
- Phase 23: `docs/archive/quality-gates/GoodMemory-Phase-23-Quality-Gate.md`, `reports/eval/live-memory/phase-23/run-1776658376536-promote/report.json`.
- Phase 29: `docs/archive/quality-gates/GoodMemory-Phase-29-Quality-Gate.md`, `reports/quality-gates/phase-29/run-20260421213000/phase-29-quality-gate.json`, `reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json`.
- Phase 30: `docs/archive/quality-gates/GoodMemory-Phase-30-Quality-Gate.md`, `reports/quality-gates/phase-30/run-20260421153410/phase-30-quality-gate.json`, `reports/eval/live-memory/phase-30/run-phase30-live-current/report.json`.
- Phase 31: `docs/archive/quality-gates/GoodMemory-Phase-31-Quality-Gate.md`, `reports/quality-gates/phase-31/run-20260422041616/phase-31-quality-gate.json`, `reports/eval/live-memory/phase-31/run-phase31-live-current/report.json`.
- Phase 32: `docs/archive/quality-gates/GoodMemory-Phase-32-Quality-Gate.md`, `reports/quality-gates/phase-32/run-20260422085720/phase-32-quality-gate.json`, `reports/eval/fallback/phase-32/run-20260422173045/report.json`, `reports/eval/live-memory/phase-32/run-phase32-live-current/report.json`.
- Phase 33: `docs/archive/quality-gates/GoodMemory-Phase-33-Quality-Gate.md`, `reports/quality-gates/phase-33/run-20260422212752/phase-33-quality-gate.json`.
- Phase 34: `docs/archive/quality-gates/GoodMemory-Phase-34-Quality-Gate.md`, `reports/eval/fallback/phase-34/run-20260422213045/report.json`, `reports/eval/live-memory/phase-34/run-phase34-live-current/report.json`, `reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json`.
- Phase 35: `docs/archive/quality-gates/GoodMemory-Phase-35-Quality-Gate.md`, `reports/eval/fallback/phase-35/run-20260423173045/report.json`, `reports/eval/live-memory/phase-35/run-phase35-live-current/report.json`, `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`.
- Phase 36: `docs/archive/quality-gates/GoodMemory-Phase-36-Quality-Gate.md`, `reports/quality-gates/phase-36/run-20260423223045/phase-36-quality-gate.json`.
- Phase 37: `docs/archive/quality-gates/GoodMemory-Phase-37-Quality-Gate.md`, `reports/eval/fallback/phase-37/run-20260424101045/report.json`, `reports/eval/live-memory/phase-37/run-phase37-live-current/report.json`, `reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json`, `reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json`.
- Phase 37.1: `docs/archive/quality-gates/GoodMemory-Phase-37.1-Quality-Gate.md`, `reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json`, `reports/quality-gates/phase-37-1/run-20260424100757/phase-37-1-quality-gate.json`.
- Phase 38: `docs/archive/quality-gates/GoodMemory-Phase-38-Quality-Gate.md`, `reports/quality-gates/phase-38/run-20260425084045/phase-38-quality-gate.json`.
- Phase 39: `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`.
- Phase 41: `reports/eval/fallback/phase-41/run-20260425213045/report.json`, `reports/eval/live-memory/phase-41/run-phase41-live-current/report.json`, `reports/quality-gates/phase-41/run-20260425223045/phase-41-quality-gate.json`.
- Phase 42: `reports/quality-gates/phase-42/run-20260426100000/phase-42-quality-gate.json`.
- Phase 43: `reports/eval/fallback/phase-43/run-20260426113000/report.json`, `reports/quality-gates/phase-43/run-20260426120000/phase-43-quality-gate.json`.
- Phase 43.5: `reports/eval/fallback/phase-43-5/run-20260426133000/report.json`, `reports/quality-gates/phase-43-5/run-20260426140000/phase-43-5-quality-gate.json`.
- Phase 45: Phase 45 is now closed as the First Reference Product and Adoption Evidence slice; examples/reference-chat-product, `bun run eval:phase-45`, `bun run gate:phase-45`, `reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json`, `reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md`.
- Phase 46: Phase 46 is now closed as the Memory Quality and Maintenance 2.0 slice; `bun run eval:phase-46`, qualityRepair, `reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json`, `reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md`.
- Phase 47: Phase 47 is now closed as the Provider-Backed Retrieval Rollout and Quality Promotion slice; `bun run eval:phase-47`, `reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json`, `reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md`.
- Phase 48: Phase 48 is now closed as the Dashboard, Cloud Sync, and Team Workspace Decision slice; `bun run eval:phase-48`, no-go decision, `reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json`, `reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-48-Quality-Gate.md`.
- Phase 49: Phase 49 is now closed as the Full ImplicitMemBench GoodMemory Research Eval; baseline-upstream-chat, goodmemory-raw-experience, goodmemory-distilled-feedback, `reports/eval/research/phase-49/baseline/run-phase49-smoke-current/report.json`, `reports/eval/research/phase-49/goodmemory/run-phase49-smoke-current/report.json`, `reports/eval/research/phase-49/comparison/run-phase49-smoke-current/report.json`, `reports/quality-gates/phase-49/run-20260428210000/phase-49-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-49-Quality-Gate.md`.
- Phase 50: `reports/eval/fallback/phase-50/run-20260428223000-installer-eval/report.json`, `reports/quality-gates/phase-50/run-20260428224500/phase-50-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-50-Quality-Gate.md`.
- Phase 52: `reports/eval/fallback/phase-52/run-phase52-fallback-current/report.json`, `reports/eval/live-memory/phase-52/run-phase52-live-current/report.json`, `reports/quality-gates/phase-52/run-20260502183000/phase-52-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-52-Quality-Gate.md`.
- Phase 59: Phase 59 is the Generalized Raw Executor Cleanup slice; failed/preferred operations, `reports/eval/fallback/phase-59/run-phase59-fallback-current/report.json`, `reports/eval/fallback/phase-59/run-phase59-fallback-current/raw-diagnostics.json`, `reports/quality-gates/phase-59/run-20260504193000/phase-59-quality-gate.json`, `docs/archive/quality-gates/GoodMemory-Phase-59-Quality-Gate.md`, `goodmemory-raw-experience` at `58 / 60`, raw `90 / 200`, raw `88 / 200`, raw at least `115 / 200`, distilled `151 / 200`.

## Documentation Policy

Root current-status docs should stay compact. If a future change needs detailed phase provenance, add it to generated reports or an archive summary, not this file.
