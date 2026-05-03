# GoodMemory Current Status and Evidence

This document is the stable entrypoint for the current repo state.
It summarizes what is public, what remains internal, and which evidence artifacts are the canonical places to audit today.
It intentionally replaces phase-by-phase navigation at the top level of `README.md` and `docs/`.

## Stable OSS Surface

- Current published package target for the stable v0.2 line is `0.2.2`; Phase
  40 remains the initial `0.2.0` release-proof gate for the line.
- Public memory API remains centered on `createGoodMemory`, `remember`, `recall`, `buildContext`, `feedback`, `forget`, `exportMemory`, and `deleteAllMemory`.
- Public domain write customization is now accepted through `GoodMemoryConfig.remember`, `RememberProfile`, `rememberRules`, `RememberInput.annotations`, and traceable extractor composition.
- `goodmemory`, `goodmemory/ai-sdk`, `goodmemory/host`, `goodmemory/http`, and `goodmemory/runtime-kit` now resolve through compiled `dist/` artifacts and emitted type declarations on the packaged install surface.
- `createGoodMemory({})` now defaults to auto storage resolution: explicit storage config wins as one source; otherwise Postgres is preferred only when a configured target can bootstrap the GoodMemory backend; Bun keeps local SQLite as the zero-config durable fallback; Node zero-config runtime falls back to in-memory when the built-in local SQLite adapter is unavailable.
- `inspectGoodMemoryRuntime(memory)` now exposes the sanitized resolved storage/runtime plan so Node zero-config in-memory fallback is observable through the public API instead of being silent, unsupported built-in `sqlite` / `postgres` selections are reported as unavailable instead of durable, and injected storage adapters are reported as adapter-defined execution instead of being mislabeled as the configured built-in plan.
- The official CLI surface remains memory-first for stable read paths: `goodmemory inspect`, `trace`, `export-memory`, `stats`, plus nested eval inspection commands, and the installed-package invocation path is `./node_modules/.bin/goodmemory ...`. The package bin is Node-safe, `goodmemory -V` / `goodmemory --version` answer directly from package metadata, and non-version command execution is still Bun-backed today.
- Phase 35 installed host-memory middleware is now part of the accepted stable host surface through `goodmemory setup`, `goodmemory status`, `goodmemory install|uninstall <codex|claude>`, `goodmemory enable|disable <codex|claude>`, `SessionStart` / `UserPromptSubmit` hooks, read-only MCP, and explicit write CLI commands. Interactive setup now defaults to global activation with workspace-derived isolation, prompts for optional Postgres, embedding, LLM extraction, and installed-host writeback mode, recommends `observe` for new host configs, preserves existing writeback mode when the interactive prompt default is accepted, keeps `--json` / `--no-interactive` script-safe, and still lets users skip provider setup and add it later in `~/.goodmemory/<host>.json`.
- Phase 35 is now closed as the installed host-memory middleware and hooks slice.
- Phase 37 is now closed as the installed host selective writeback slice. Codex installed host supports opt-in `off` / `observe` / `selective` writeback through `goodmemory codex writeback`, `install|enable --writeback`, and `session-stop` delegation. Runtime config defaults and new scripted installs remain `off` unless explicitly changed; existing configs keep their current writeback mode when no explicit override is provided; new interactive installs recommend `observe`. `observe` stores bounded/redacted candidate previews for review without durable writes; `selective` writes only selected candidates through the public Phase 36 `remember` surface.
- Phase 41 is now closed as installed-host pre-action unification. `goodmemory install|enable codex` now registers managed `PreToolUse` for `Bash`, `goodmemory codex hook pre-tool-use` evaluates risky first steps on the installed config/storage/providers path, and `goodmemory codex action` executes rewrite/veto decisions plus lineage/evidence on the same installed memory backend already used by recall and writeback.
- Phase 42 is now closed as the Progressive Recall Protocol slice. GoodMemory now has an internal `ProgressiveRecallService` for compact index, timeline, detail, and progressive context rendering; `gmrec:v1:${scopeDigest}:${recordKind}:${id}` refs are the detail handoff protocol; MCP `goodmemory_search_index`, `goodmemory_timeline`, and `goodmemory_get_records` wrap the shared service; installed-host `contextMode: "fragment" | "progressive"` defaults old configs to `fragment` and only uses progressive hook context when the local MCP detail transport is registered. This does not widen the root `goodmemory` API and does not make MCP the owner of recall logic.
- Phase 43 is now closed as the Runtime Kit slice. `goodmemory/runtime-kit` exposes a host-neutral lifecycle adapter around existing public GoodMemory APIs, Phase 42 progressive recall, and the Phase 41 pre-action contracts; `beforeModelCall` can render fragment or progressive context, `preAction` resolves host action execution plans, `afterModelCall` defaults to bounded non-durable candidates/jobs/trace only, and AI SDK now calls runtime-kit rather than owning a parallel memory loop. Runtime-kit events expose keyed `scopeDigest` values instead of raw scope ids and do not widen the root `goodmemory` API.
- Phase 43.5 is now closed as the Optional Runtime Worker slice. `goodmemory runtime worker drain-once|status|recover|start|stop` provides a local file-backed, read/repair-oriented worker queue for runtime-kit bounded job envelopes. Envelopes store redacted preview, scopeDigest, host, attempts, trace links, and audit transitions only; they do not store raw transcripts or full assistant output. Drain/status/recover close without requiring daemon mode, while start/stop only toggle local optional daemon state.
- Phase 44 is now closed as the Local Viewer data API and lightweight UI slice. `goodmemory runtime viewer --host <codex|claude> --port <n>` starts an optional local read-only viewer on `127.0.0.1` with a local token, no CORS, no mutation routes, no raw transcript display, progressive `gmrec:v1` drill-down, redacted writeback audit/trace/session summaries, and CLI handoff commands for forget/revise review. The viewer is an inspectability surface, not a dashboard, managed cloud, analytics, or write UI.
- Phase 45 is now closed as the First Reference Product and Adoption Evidence slice. `examples/reference-chat-product` shows a product-shaped chat backend that uses only public package exports and the authenticated `goodmemory/http` bridge, with `bun run example:reference-product`, `bun run eval:phase-45`, and `bun run gate:phase-45` covering install/boot/evaluate/inspect flows. The accepted report compares an observed no-memory baseline with rules-only GoodMemory, records provider-backed uplift as explicit skip unless a later phase implements it, uses the Phase 44 local viewer only for read-only inspectability, and keeps forget/revise mutations in backend CLI/API handoff paths rather than browser-executed viewer routes.
- Phase 46 is now closed as the Memory Quality and Maintenance 2.0 slice. `bun run eval:phase-46` consumes the canonical Phase 45 redacted adoption report, records observed failure samples for no-memory missed recall and rejected unsafe/noisy observe candidates, and keeps stale-recall repair as a maintenance guardrail rather than claiming a Phase 45 stale failure. `qualityRepair` is explicit, not part of default hygiene maintenance, and demotes stale inferred action facts only with bounded verification pressure, old age, low confidence/importance, no recent access, and an active newer replacement fact. Provider-backed retrieval promotion remains separated for Phase 47.
- Phase 47 is now closed as the Provider-Backed Retrieval Rollout and Quality Promotion slice. `bun run eval:phase-47` compares deterministic rules-only and explicit `hybrid` provider-backed recall over real `createGoodMemory().recall()` paths, then requires useful recall improvement without increased wrong recall, stale recall, or setup fragility. The HTTP bridge accepts explicit `auto` / `rules-only` / `hybrid` recall strategy, keeps omitted and `auto` bridge requests on rules-only even when provider runtime is configured, returns routing diagnostics, rejects public `llm-assisted` request-body rollout, and falls back to rules-only context with `provider_error` only for explicit `hybrid` provider-backed execution failures. Rules-only remains the default accepted mode; provider-backed retrieval is not default-on.
- Phase 48 is now closed as the Dashboard, Cloud Sync, and Team Workspace Decision slice with an accepted no-go decision. `bun run eval:phase-48` reads the accepted Phase 44-47 evidence and records that hosted dashboard, cloud sync, and team workspace are not justified today; `bun run gate:phase-48` preserves the Phase 44 local viewer as local-only/read-only, requires auth/tenancy/redaction/export/deletion/audit/raw-transcript boundaries before any future hosted pilot, and proves no root API or package subpath widening for dashboard/cloud/team surfaces.
- Phase 50 is now closed as the Installer CLI Runtime-Shell Hardening slice. `goodmemory setup`, `install`, and `enable` now support `--dry-run` planning; `goodmemory doctor [codex|claude|both]` provides read-only installed-host diagnostics; and `goodmemory repair [codex|claude|both]` repairs missing GoodMemory-managed hook/MCP/workspace wiring while preserving installed storage, provider, `contextMode`, and writeback settings. This hardens the existing installer command family without adding a parallel `goodmemory installer` namespace, new hosts, root API exports, default-on writeback, daemon/viewer startup, hosted surfaces, or raw transcript archive.
- Phase 51 is now closed as the Typed Behavioral Memory And Enactment
  Hardening slice. Typed behavioral policy stays internal-only, is stored
  additively on compiled `validated_pattern` feedback attributes, keeps legacy
  `rule` / `why` / `appliesTo` compatibility, and hardens targeted runtime/eval
  enactment through hidden steering, applicability bounds, exact first-action
  preservation, and explicit leak suppression without widening the public API,
  public config, or README-level defaults.
- Phase 52 is now closed as the Structured Text-Response Enactment And
  Guarded Policy slice. Internal guarded-policy attributes add
  `guarded_policy`, `rewrite_output_slot`, `require_precondition_check`, and
  exact host-action recovery over compiled `validated_pattern` feedback while
  preserving the stable public API and config surface. Canonical evidence:
  deterministic targeted eval
  `reports/eval/fallback/phase-52/run-phase52-fallback-current/report.json`,
  live-memory behavioral evidence
  `reports/eval/live-memory/phase-52/run-phase52-live-current/report.json`,
  quality gate
  `reports/quality-gates/phase-52/run-20260502183000/phase-52-quality-gate.json`,
  and archive summary
  `docs/archive/quality-gates/GoodMemory-Phase-52-Quality-Gate.md`.
- Phase 37.1 is now closed as installed-host writeback productization polish. It adds audit/undo CLI surfaces through `goodmemory codex writeback inspect` and `goodmemory codex writeback forget --event-id`, a v4 audit ledger with bounded redacted previews, observe-only `observed` / `dismissed` events, and typed linked records, deterministic fixture-backed dogfood evidence for clean CI, local real-ledger dogfood mode for follow-up validation, and a Phase 37.1 quality gate. It does not change the Phase 37 accepted claim: writeback remains opt-in, no raw transcript archive is added, and no root public writeback API is introduced.
- Phase 38 is now closed as the governed runtime surface slice. The accepted surface includes `GoodMemoryConfig.observability.traceSink` plus redaction-safe typed `GoodMemoryTraceSpan` emissions for the core public memory API, private keyed scope digests by default, targeted `reviseMemory()` for governed correction by explicit `memoryId`, a `memory.runtime.*` facade on the `createGoodMemory()` result with summary-only archive persistence explicit and off by default, an explicit in-memory `memory.jobs.*` scheduler including `memory.jobs.enqueueRemember()` for background remember writes, `GoodMemoryConfig.providers.embedding` / `providers.extraction` as a facade over the existing provider adapter resolver, and thin Express/Fastify HTTP examples at `examples/express-chat-server.ts` and `examples/fastify-chat-server.ts` that use the governed runtime and jobs surface without framework coupling.
- Phase 39 is now closed as the Python HTTP integration bridge slice. The accepted public surface is `goodmemory/http` plus the packaged `goodmemory-http-bridge` server bin for Python/FastAPI consumers, with `POST /memory/recall-context`, `remember`, `feedback`, `export`, `forget`, and targeted `revise` endpoints built only on public GoodMemory APIs, scoped authorization for export/forget/revise, bearer-token server startup by default, bridge-level async remember through `memory.jobs.*`, a life-coach reference profile without a built-in OneLife preset, and Python process smoke coverage at `examples/python-fastapi-memory-consumer.py`.
- Phase 40 is now closed as the v0.2 release proof and product eval slice. The accepted release surface keeps the Phase 38 governed runtime and Phase 39 Python bridge unchanged, proved the initial `0.2.0` package/public-doc alignment, proves cross-consumer adoption across direct TypeScript, Express, Fastify, Python/FastAPI bridge, and installed-host package paths, and records product eval uplift against a no-memory baseline without adding dashboard, managed cloud, raw CRUD, default-on writeback, or raw transcript archive behavior.
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
- Full ImplicitMemBench GoodMemory evaluation remains internal research
  infrastructure; it does not change the stable OSS runtime surface or the
  release hard gate.

## Latest Closed Slice

- Phase 54 is now closed as the Exemplar-First Raw Internalization slice.
- Accepted behavior:
  - raw behavior carryover now has an internal exemplar-first lane that is
    derived from experiences, archives, host traces, and accepted correction
    lineage without widening the public API or adding a new public memory kind
  - raw selection no longer relies on prose-only behavioral steering as the
    primary carrier; it now uses interference-aware exemplar selection,
    abstention, and prototype-bounded clustering before rendering carryover
  - runtime-kit and the research harness can inject minimal behavioral
    exemplars for `text_response` and `host_action` surfaces while keeping
    explicit memory-note phrasing suppressed
  - maintenance consolidation now summarizes raw exemplar/prototype density as
    internal derived evidence rather than promoting exemplar traces into a new
    durable record family
  - targeted deterministic and live Phase 54 evidence both close with
    `executionFailures = 0`, `goodmemory-distilled-feedback` passing all 12
    targeted task files, `goodmemory-raw-experience` improving from the frozen
    targeted baseline of `3 / 12` to `5 / 12` live passes, and targeted
    explicit recall leaks staying `0`
- Canonical evidence:
  - archive summary:
    `docs/archive/quality-gates/GoodMemory-Phase-54-Quality-Gate.md`
  - deterministic targeted eval:
    `reports/eval/fallback/phase-54/run-phase54-fallback-current/report.json`
  - live-memory behavioral evidence:
    `reports/eval/live-memory/phase-54/run-phase54-live-current/report.json`
  - quality gate:
    `reports/quality-gates/phase-54/run-20260503193000/phase-54-quality-gate.json`
- Still outside the Phase 54 accepted claim:
  - the post-gate full-300 research rerun remains research-only evidence and
    does not define the acceptance bar for this slice
  - public API or public config widening
  - a new durable public memory kind or public record collection
  - full-300 ImplicitMemBench rerun as a release hard gate or public product
    claim
  - benchmark-specific runtime hacks or per-task-file prompt patches as the
    accepted product mechanism

## Prior Closed Installer Slice

- Phase 50 is now closed as the Installer CLI Runtime-Shell Hardening slice.
- Accepted behavior:
  - `setup`, `install`, and `enable` support `--dry-run --json` planning
  - dry-run reflects requested activation, context mode, writeback, storage,
    provider, and user options without writing managed files
  - `doctor` is read-only and reports config, hook, pre-action, MCP,
    workspace, context mode, writeback mode, repairability, warnings, and next
    commands
  - unmanaged hook/MCP conflicts are reported as manual-fix diagnostics instead
    of repairable states
  - `repair` restores missing GoodMemory-managed installed-host wiring and
    returns nonzero for explicit missing or manual-fix targets
  - repair preserves existing installed config values and does not escalate
    writeback mode
  - default non-interactive `install` and `setup --host both` keep writeback
    `off` unless explicitly configured otherwise
  - Codex and Claude remain the only accepted hosts
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-50-Quality-Gate.md`
  - deterministic installer eval:
    `reports/eval/fallback/phase-50/run-20260428223000-installer-eval/report.json`
  - quality gate:
    `reports/quality-gates/phase-50/run-20260428224500/phase-50-quality-gate.json`
- Still outside the Phase 50 accepted claim:
  - Cursor, Gemini, or other new host adapters
  - a new `goodmemory installer` namespace
  - root public API or package subpath widening
  - default-on durable writeback
  - default-on worker daemon or viewer startup
  - hosted dashboard, cloud sync, team workspace, or browser mutation surface
  - raw transcript archive

## Prior Internal Research Slice

- Phase 49 is now closed as the Full ImplicitMemBench GoodMemory Research Eval
  slice.
- Accepted behavior:
  - Phase 49 adds an external benchmark-root adapter for the full
    ImplicitMemBench dataset without vendoring the upstream repository
  - the repo carries only a mirrored smoke subset plus a checked-in adapter
    manifest and CC BY 4.0 attribution
  - `baseline-upstream-chat` preserves the upstream protocol by prompt-injecting
    learning, interference, and probe into one final generation
  - `goodmemory-raw-experience` replays learning and interference into
    GoodMemory and gives the final generator only `memoryContext + test_probe`
  - `goodmemory-distilled-feedback` adds explicit feedback for procedural and
    conditioning cases while still keeping the final prompt probe-only
  - priming remains paired `experimental/control` and is intentionally omitted
    from `goodmemory-distilled-feedback`
  - scoring is explicit and manifest-routed across
    `structured_first_action`, `text_behavior_judge`, and
    `priming_pair_judge`
  - `gate:phase-49` proves smoke harness integrity only; it does not claim a
    checked-in full-300 benchmark result or make ImplicitMemBench a release
    blocker
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-49-Quality-Gate.md`
  - baseline smoke report:
    `reports/eval/research/phase-49/baseline/run-phase49-smoke-current/report.json`
  - GoodMemory smoke report:
    `reports/eval/research/phase-49/goodmemory/run-phase49-smoke-current/report.json`
  - comparison smoke report:
    `reports/eval/research/phase-49/comparison/run-phase49-smoke-current/report.json`
  - quality gate:
    `reports/quality-gates/phase-49/run-20260428210000/phase-49-quality-gate.json`
  - ad hoc full-300 research summary:
    `docs/GoodMemory-ImplicitMemBench-Full-300-Research-Summary.md`
  - latest post-Phase-54 rerun status, as summarized in the research doc:
    GoodMemory-only Postgres-backed 5-shard rerun landed at raw `42 / 200`,
    distilled `151 / 200`, conditioning distilled `85 / 100`, procedural
    distilled `66 / 100`, structured first-action distilled `21 / 35`, raw /
    distilled execution failures at `19 / 3`, explicit recall leaks at
    `3 / 0`, and confirmed that the largest remaining gaps are still
    raw-only internalization stability plus operator reliability under the
    full provider-backed 300-case run
  - latest closed execution slice:
    `task-board/58-phase-53-surface-determinism-escalation-routing-and-procedural-executor-recovery.txt`
- Still outside the Phase 49 accepted claim:
  - a checked-in full 300-item live run against an external benchmark checkout
  - release hard-gating on ImplicitMemBench quality numbers
  - an outcome-telemetry profile for the upstream benchmark
  - public API or public config widening for research-only evaluation
  - README-level product claims that GoodMemory already passes the full 300-item
    benchmark

## Prior Closed Hosted-Surface Decision

- Phase 48 is now closed as the Dashboard, Cloud Sync, and Team Workspace Decision slice with an accepted no-go decision.
- Accepted behavior:
  - Phase 48 compiles the accepted Phase 44 local-viewer gate, Phase 45 adoption report, Phase 46 quality gate, and Phase 47 provider-rollout gate into one decision report
  - hosted dashboard, cloud sync, and team workspace each close as `no_go`
  - no hosted/cloud/team runtime is implemented, and no package subpath export is added for dashboard, cloud, or team surfaces
  - the Phase 44 local viewer remains local-only, token-gated, no-CORS, read-only, and non-mutating
  - browser-executed forget/revise remains outside the local viewer
  - raw transcript persistence is blocked by default
  - future reconsideration requires a measured adoption blocker plus auth, tenancy, redaction, export, deletion, audit, and raw-transcript semantics before implementation
  - root `goodmemory` public API and package subpath exports are not widened for Phase 48
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-48-Quality-Gate.md`
  - decision report: `reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json`
  - quality gate: `reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json`
- Still outside the Phase 48 accepted claim:
  - hosted dashboard, account system, managed cloud, analytics, or sync
  - team workspace memory sharing
  - viewer mutation routes or browser-executed forget/revise
  - raw transcript archive or full assistant-output persistence
  - CORS-enabled remote viewer/API
  - new root public API or hosted package subpath exports

## Prior Closed Provider Slice

- Phase 47 is now closed as the Provider-Backed Retrieval Rollout and Quality Promotion slice.
- Accepted behavior:
  - `strategy: "hybrid"` is the explicit provider-backed retrieval request while rules-only remains the default
  - the HTTP bridge reports requested/resolved strategy, semantic tie-breaking, LLM refinement status, fallback reason, and provider fallback metadata
  - public HTTP bridge request bodies accept `auto`, `rules-only`, and `hybrid`, but not `llm-assisted`
  - omitted and `auto` HTTP bridge requests resolve to rules-only even when provider runtime is configured
  - classified embedding/vector/semantic/provider errors fall back to rules-only context with `provider_error` only for explicit `hybrid` provider-backed execution
  - non-provider recall errors are not masked as successful provider fallback
  - promotion evidence compares rules-only and hybrid against Phase 45/46 accepted evidence and proves no-strategy/`auto` bridge defaults stay rules-only
  - accepted metrics require useful recall improvement without increasing wrong recall, stale recall, or setup fragility
  - root `goodmemory` public API and package subpath exports are not widened for Phase 47
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md`
  - provider rollout eval: `reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json`
  - quality gate: `reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json`
- Still outside the Phase 47 accepted claim:
  - hosted dashboard, account system, managed cloud, analytics, or sync
  - viewer mutation routes or browser-executed forget/revise
  - raw transcript archive or full assistant-output persistence
  - CORS-enabled remote API
  - default-on provider-backed retrieval
  - public HTTP bridge `llm-assisted` recall rollout
  - new root public API or new installed-host hook capability

## Prior Closed Quality Slice

- Phase 46 is now closed as the Memory Quality and Maintenance 2.0 slice.
- Accepted behavior:
  - Phase 46 quality eval reads the canonical Phase 45 adoption report and keeps generated fallback output ignored/reproducible
  - failure samples are limited to observed Phase 45 failures: no-memory missed recall and rejected unsafe/noisy observe candidate
  - stale recall is a `guardedRepairScenarios` maintenance guardrail with `observedPhase45Failure: false`, not a fabricated Phase 45 stale failure
  - `qualityRepair` is an explicit maintenance job and is not part of default hygiene maintenance
  - outcome-aware maintenance runs `qualityRepair` before dedupe and contradiction repair
  - stale action-fact demotion requires inferred source, low confidence/importance, repeated verification pressure, old age, no recent access, action-driving classification, and an active newer replacement fact
  - same-run demotions update the active replacement set so a replacement demoted earlier in the job cannot justify demoting the stale fact later
  - over-remembering repair uses generic `memoryQuality*` attributes and does not inspect raw transcripts
  - root `goodmemory` public API and package subpath exports are not widened for Phase 46
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md`
  - quality eval: `reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json`
  - quality gate: `reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json`

## Prior Closed Reference Product Slice

- Phase 45 is now closed as the First Reference Product and Adoption Evidence slice.
- Accepted behavior:
  - reference product lives under `examples/reference-chat-product`
  - TypeScript path imports only `goodmemory` and `goodmemory/http`
  - FastAPI path calls the authenticated HTTP bridge endpoints for recall, remember, feedback, export, forget, and targeted revise
  - product-level idempotency is durable in the FastAPI backend and scoped before bridge side effects
  - adoption eval covers 12 product memory families, including identity/background, preferences, continuation, correction, forget, feedback, observe, selective writeback, rules-only fallback, optional provider-backed uplift, and local viewer inspection
  - no-memory baseline is observed by an empty reference-product backend rather than fabricated
  - provider-backed evidence is skipped locally and blocks acceptance when explicitly requested until a real provider-backed execution path exists in a later phase
  - viewer inspection calls summary, recall index, progressive records, and handoff routes while keeping the viewer local-only, token-gated, no-CORS, read-only, and redacted
  - backend revise/forget mutations are proven outside the viewer through product API flow
  - accepted artifacts persist redacted scenario evidence only, not raw transcripts, private emails, secrets, or raw scope ids
  - root `goodmemory` and package subpath exports are not widened for the reference product or viewer
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md`
  - adoption eval: `reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json`
  - quality gate: `reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json`

## Prior Closed Runtime-Shell Slices

- Phase 43.5 is now closed as the Optional Runtime Worker slice.
- Accepted behavior:
  - runtime worker envelopes contain job id, host, scopeDigest, kind, attempts, trace links, status, and redacted preview only
  - equivalent bounded jobs coalesce before execution and expose coalesced counts in status
  - `goodmemory runtime worker status` reads local queue state without mutation
  - `goodmemory runtime worker drain-once` processes queued bounded jobs once and is idempotent on repeated drains
  - `goodmemory runtime worker recover --dry-run` reports failed or stuck jobs without mutation; explicit apply can requeue repairs
  - worker failures are recorded as auditable failed jobs and do not throw through the inline runtime path
  - `start` and `stop` only toggle optional local daemon state; daemon mode is not required for runtime-kit, installed-host hooks, or closure
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-43.5-Quality-Gate.md`
  - deterministic eval: `reports/eval/fallback/phase-43-5/run-20260426133000/report.json`
  - quality gate: `reports/quality-gates/phase-43-5/run-20260426140000/phase-43-5-quality-gate.json`
- Still outside the Phase 43.5 accepted claim:
  - persistent distributed queue or managed worker service
  - worker as a required sidecar for recall, pre-action, or writeback
  - durable memory writes from bounded preview-only worker jobs
  - raw transcript archive or full assistant-output persistence
  - local viewer or dashboard product

- Phase 43 is now closed as the Runtime Kit slice.
- Accepted behavior:
  - `goodmemory/runtime-kit` is a public adapter surface with source, dist, type, and tarball coverage
  - `createGoodMemoryRuntimeKit()` exposes `sessionStart`, `beforeModelCall`, `afterModelCall`, `sessionEnd`, `preAction`, and `observeToolResult`
  - `beforeModelCall` reuses public `recall()`/`buildContext()` for fragment context and the Phase 42 `ProgressiveRecallService` for progressive context
  - `preAction` reuses `HostActionIntent`, `HostAdapter.assessAction()`, and `resolveHostActionExecutionPlan()`
  - `afterModelCall` defaults to bounded redacted candidates/jobs/trace and does not durable-write under `off` or `observe`
  - durable `remember()` only happens under explicit `selective` writeback with a `durable_candidate` host annotation and allow policy
  - AI SDK recall/writeback now calls runtime-kit lifecycle methods instead of duplicating memory-loop logic
  - runtime-kit events expose `GoodMemoryScopeDigest`, not raw `userId`, `workspaceId`, or `sessionId`
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-43-Quality-Gate.md`
  - deterministic eval: `reports/eval/fallback/phase-43/run-20260426113000/report.json`
  - quality gate: `reports/quality-gates/phase-43/run-20260426120000/phase-43-quality-gate.json`
- Still outside the Phase 43 accepted claim:
  - optional worker daemon or required sidecar
  - local viewer or dashboard product
  - default-on writeback
  - root `goodmemory` API widening
  - raw transcript archive

- Phase 42 is now closed as the Progressive Recall Protocol slice.
- Accepted behavior:
  - `ProgressiveRecallService` owns the shared search index, timeline, detail, and progressive context renderer logic
  - `gmrec:v1` recordRefs include a keyed `scopeDigest`, record kind, and encoded id; detail fetch accepts recordRefs only and rejects bare ids and cross-scope refs
  - progressive index/detail output redacts raw scope ids and raw transcripts
  - runtime working memory/open loops are preserved as required progressive runtime context and cannot be pushed out by ordinary durable ranking
  - progressive rendering enforces the installed-host token budget as a hard upper bound
  - MCP tools wrap the shared service instead of duplicating recall/index/detail logic
  - installed-host `contextMode` is parsed, migrated, surfaced in status/install/enable flows, and falls back to fragment output when progressive detail transport is unavailable
  - hook-written progressive detail cache is local, short-lived, redacted, and can only be read back by MCP after recomputing the current resolved scope digest
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-42-Quality-Gate.md`
  - deterministic eval: `reports/eval/fallback/phase-42/run-20260426093000/report.json`
  - quality gate: `reports/quality-gates/phase-42/run-20260426100000/phase-42-quality-gate.json`
- Still outside the Phase 42 accepted claim:
  - dashboard or hosted viewer product
  - required worker/daemon/sidecar
  - default-on writeback
  - root `goodmemory` API widening
  - raw transcript archive
  - copying or packaging `third-party/claude-mem-main`

## Prior Closed Installed-Host Slices

- Phase 41 is now closed as installed-host pre-action unification.
- Accepted behavior:
  - `goodmemory install codex` plus `goodmemory enable codex` registers managed `PreToolUse` alongside the existing recall and writeback hooks
  - `goodmemory codex hook pre-tool-use` denies or redirects only when installed policy requires review or veto, and otherwise fails open
  - `goodmemory codex action` reuses the installed config/storage/providers path through `resolveInstalledHostContext()`, `createInstalledHostMemory()`, `createHostAdapter(...).assessAction()`, and `resolveHostActionExecutionPlan()`
  - policy-backed `./tools/DeepAnalyzer --detailed` redirects so the first executed step becomes `./tools/QuickCheck`
  - policy-backed `rm -rf AGENTS.md` is vetoed on the installed path
  - low-risk `./tools/QuickCheck --network` is not misblocked
  - installed pre-action, recall, and writeback now share one installed storage backend and action lineage/evidence path
  - Phase 34 bootstrap wrapper remains available as a compatibility path and is still regression-covered, not replaced as historical evidence
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-41-Quality-Gate.md`
  - deterministic eval: `reports/eval/fallback/phase-41/run-20260425213045/report.json`
  - installed live report: `reports/eval/live-memory/phase-41/run-phase41-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-41/run-20260425223045/phase-41-quality-gate.json`
  - prior gates kept in regression chain:
    - `reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json`
    - `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`
    - `reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json`
- Still outside the Phase 41 accepted claim:
  - reopening Phase 34 bootstrap-wrapper closure
  - widening the root GoodMemory API
  - Claude pre-action as a second live blocker
  - default-on writeback
  - transcript persistence as installed-host memory

- Phase 40 is now closed as the v0.2 release proof and product eval slice.
- Accepted behavior:
  - Phase 39 Python HTTP bridge closure is the immutable release-evidence input
  - initial release metadata, README, public docs, and release checklist agreed on `0.2.0`
  - README App Quickstart and `docs/GoodMemory-15-Minute-App-Integration.md` show the current runtime/recall/context/jobs loop
  - release workflow uses `gate:phase-40` as the stable release gate
  - package-boundary CI covers Node 20, Node 22, and Node 24
  - external tarball consumer smoke and `bun pm pack --dry-run` are part of the accepted gate
  - cross-consumer adoption smoke covers direct TypeScript, Express, Fastify, Python/FastAPI bridge, and installed-host package paths
  - product eval rollup compares with-GoodMemory against a no-memory baseline for identity/background understanding, historical task continuation, open-loop recall, user correction, feedback learning, background jobs, and trace explainability
  - default runtime archive remains off and the product eval report does not persist raw transcripts as canonical evidence
- Canonical evidence:
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-40-Quality-Gate.md`
  - quality gate: `reports/quality-gates/phase-40/run-20260425172323/phase-40-quality-gate.json`
  - cross-consumer adoption smoke: `reports/eval/adoption/phase-40/run-20260425163012-cross-consumer/report.json`
  - product eval rollup: `reports/eval/product/phase-40/run-20260425165544-product-eval/report.json`
  - Phase 39 release input: `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`
- Still outside the Phase 40 accepted claim:
  - query-resolved correction targets
  - `correctMemory()` alias
  - raw CRUD APIs such as `memory.facts.add()` or `memory.preferences.upsert()`
  - `remember({ mode: "background" })`
  - public router provider config
  - persistent distributed job queue
  - dashboard, managed cloud, hosted sync, or analytics product
  - default-on writeback
  - raw transcript archive
  - built-in OneLife preset
  - LangGraph-first integration

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

## Current Planned Runtime-Shell Work

- Phase 41.9 is a bookkeeping-only sync that keeps Phase 41 leaf task-board
  status aligned with the accepted Phase 41 current-status and quality-gate
  evidence. It does not reopen Phase 41 or change accepted behavior.
- Phase 42 is closed as Progressive Recall Protocol; its accepted evidence is
  listed under the prior closed runtime-shell slices and in the Phase 42 archive
  summary.
- Phase 43 is closed as Runtime Kit: `goodmemory/runtime-kit`, lifecycle
  orchestration, Phase 41 pre-action reuse, afterModelCall governance,
  deterministic Codex/Claude adapter parity, and AI SDK integration. It did not
  promote worker daemon, viewer, dashboard, raw transcript archive, default-on
  writeback, or root API widening into the accepted claim.
- Phase 43.5 is closed as Optional Runtime Worker: bounded runtime-kit job
  envelopes, local drain-once/status/recover, optional daemon state markers,
  coalescing, audit transitions, and no raw transcript payloads.
- Phase 44 is closed as Local Viewer data API and lightweight UI: read-only
  local inspection, progressive drill-down, writeback audit, trace/session
  summaries, local-token security, and package/license hygiene. It did not add
  dashboard, managed cloud, analytics, CORS, mutation routes, or raw transcript
  archive behavior.
- Phase 45 is closed as First Reference Product and Adoption Evidence:
  `examples/reference-chat-product`, `eval:phase-45`, and `gate:phase-45`
  prove a public package/HTTP bridge adoption loop, observed no-memory
  baseline comparison, redacted local-viewer inspectability, and backend-only
  correction/forget/revise mutation flows. It did not add hosted dashboard,
  provider-backed rollout, viewer mutation routes, raw transcript archive, or
  root API widening.

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
- v0.2 release proof and product eval closure:
  - Summary: `docs/archive/quality-gates/GoodMemory-Phase-40-Quality-Gate.md`
  - Quality gate: `reports/quality-gates/phase-40/run-20260425172323/phase-40-quality-gate.json`
  - Cross-consumer adoption smoke: `reports/eval/adoption/phase-40/run-20260425163012-cross-consumer/report.json`
  - Product eval rollup: `reports/eval/product/phase-40/run-20260425165544-product-eval/report.json`
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
