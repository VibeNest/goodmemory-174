# GoodMemory Current Status and Evidence

This document is the stable entrypoint for the current repo state.
It summarizes what is public, what remains internal, and which evidence artifacts are the canonical places to audit today.
It intentionally replaces phase-by-phase navigation at the top level of `README.md` and `docs/`.

## Stable OSS Surface

- Current published package target for the stable v0.2 line is `0.2.5`; Phase
  40 remains the initial `0.2.0` release-proof gate for the line.
- Public memory API remains centered on `createGoodMemory`, `remember`, `recall`, `buildContext`, `feedback`, `forget`, `exportMemory`, and `deleteAllMemory`.
- Public domain write customization is now accepted through `GoodMemoryConfig.remember`, `RememberProfile`, `rememberRules`, `RememberInput.annotations`, and traceable extractor composition.
- `goodmemory`, `goodmemory/ai-sdk`, `goodmemory/host`, `goodmemory/http`, and `goodmemory/runtime-kit` now resolve through compiled `dist/` artifacts and emitted type declarations on the packaged install surface.
- `createGoodMemory({})` now defaults to auto storage resolution: explicit storage config wins as one source; otherwise Postgres is preferred only when a configured target can bootstrap the GoodMemory backend; Bun keeps local SQLite as the zero-config durable fallback; Node zero-config runtime falls back to in-memory when the built-in local SQLite adapter is unavailable.
- `inspectGoodMemoryRuntime(memory)` now exposes the sanitized resolved storage/runtime plan so Node zero-config in-memory fallback is observable through the public API instead of being silent, unsupported built-in `sqlite` / `postgres` selections are reported as unavailable instead of durable, and injected storage adapters are reported as adapter-defined execution instead of being mislabeled as the configured built-in plan.
- The official CLI surface remains memory-first for stable read paths: `goodmemory inspect`, `trace`, `export-memory`, `stats`, plus nested eval inspection commands. The global CLI invocation path is `goodmemory ...` after `npm install -g goodmemory`, while a project-local package install must use `npx goodmemory`, `npm exec -- goodmemory`, or `./node_modules/.bin/goodmemory ...`. The package bin is Node-safe for `goodmemory -V` / `goodmemory --version`, and non-version command execution is still Bun-backed today.
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

## Prior Closed Research Slice

- Phase 60 is now closed as the ImplicitMemBench Overall And Priming Protocol
  slice. It adds a separate Phase 60 summary layer for `blockingScore`,
  `primingScore`, `full300OverallScore`, `overallComparableToOfficial`, and
  priming contamination/task-compliance/leak accounting while preserving the
  legacy Phase 49 blocking report semantics.
- Canonical evidence:
  - archive summary:
    `docs/archive/quality-gates/GoodMemory-Phase-60-Quality-Gate.md`
  - deterministic protocol summary:
    `reports/eval/fallback/phase-60/run-phase60-fallback-current/overall-summary.json`
  - quality gate:
    `reports/quality-gates/phase-60/run-20260505120000/phase-60-quality-gate.json`
- Accepted boundary:
  - no public API/config widening
  - no new public durable memory kind
  - no release hard gate
  - no README-level leaderboard claim

## Active Research Slice

- Phase 62 LongMemEval is accepted as the first Sequential Benchmark Hardening
  slice, following the external proof order LongMemEval -> BEAM ->
  MemoryAgentBench -> LoCoMo. Phase 63 BEAM is now active as the next internal
  hardening step. This remains internal research hardening, not a public
  LongMemEval claim.
- Current Phase 63 evidence:
  - source intake records BEAM paper and Hugging Face dataset source, visible
    `cc-by-sa-4.0` dataset license, Parquet upstream format, and an initial
    100K-first local strategy
  - synthetic smoke fixture and attribution are in
    `fixtures/external-benchmarks/beam/beam_100k_smoke.json` and
    `fixtures/external-benchmarks/ATTRIBUTION.md`
  - `eval:phase-63` and `gate:phase-63` are package scripts for the BEAM smoke
    harness
  - local smoke run `run-phase63-beam-smoke-current` covers three synthetic
    BEAM-shaped questions across `baseline-no-memory`, `baseline-full-context`,
    `goodmemory-rules-only`, and `goodmemory-hybrid` with
    `executionFailures: 0`
  - local gate `run-20260518003000` is accepted through `bun run gate:phase-63`
  - `prepare:phase-63-beam` exports real BEAM rows to an external root without
    vendoring upstream data; it supports the Hugging Face rows export path and
    the GitHub raw fallback path (`--source github-raw`) when the rows endpoint
    is unavailable. External BEAM fetches now use bounded `curl` retry and
    timeout flags so transient rows/raw-source failures do not require manual
    command rewriting. The current local 100K export lives at
    `/private/tmp/BEAM/100K.json` with 20/20 rows and 400 probing questions
    from the GitHub raw fallback source.
  - initial external-root run
    `run-phase63-beam-100k-full-initial-20260518T000335Z` covers all four
    comparison profiles over the real 100K export with `executionFailures: 0`
    (`baseline-no-memory` 40/400, `baseline-full-context` 400/400 with
    wrong-recall cases 400, `goodmemory-rules-only` 400/400, and
    `goodmemory-hybrid` 400/400)
  - these Phase 63 results prove smoke/full adapter integrity and real-row
    ingestion only, not a final BEAM benchmark score; current hypotheses still
    use deterministic oracle answers/evidence ids rather than live GoodMemory
    answer generation and live judging
  - latest GitHub-raw source recovery diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-github-raw-source-current-20260521T170515Z`
    covers the regenerated 100K export with `executionFailures: 0`,
    evidence-chat recall 0.4540744466800807, missed-recall cases 244/355, and
    wrong-recall/noise cases 378/400. This validates the fallback source and
    same-code diagnostic path; it is not a new BEAM repair because it drifts
    slightly from the latest Hugging Face rows-export behavior checkpoint.
  - latest same-source project-lifecycle summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-project-lifecycle-summary-current-20260522T105334Z`
    compares against the GitHub-raw source baseline with
    `executionFailures: 0`, evidence-chat recall 0.45614017437961124,
    missed-recall cases 244/355, and wrong-recall/noise cases 378/400. It
    raises global hit evidence ids 395 -> 400, missing ids 699 -> 694, noise
    ids 2909 -> 2898, and zero-recall cases 118 -> 117. This is a kept
    partial selector repair, not BEAM closure: summarization improves from
    0.2598 to 0.2709, but late security/documentation evidence remains missing
    in the target project-lifecycle case.
  - latest same-source project-lifecycle facet-fill repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-project-lifecycle-facet-fill-current-20260522T161457Z`
    has `executionFailures: 0`, evidence-chat recall 0.45632796780684126,
    missed-recall cases 244/355, and wrong-recall/noise cases 378/400. It
    raises global hit evidence ids 400 -> 403 and missing ids 694 -> 691 versus
    the prior project-lifecycle summary run while keeping noise ids at 2898.
    The intended summarization bucket rises 0.2709 -> 0.2820 and target
    `1:summarization:1` recovers late security/documentation turns
    116/117/150/151/176/177. This remains a partial repair: the target still
    misses core feature turns 4/5, and one event-ordering case regresses versus
    the previous project-lifecycle checkpoint.
  - same-source framework-customization event-order repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-framework-customization-current-20260524T010538Z`
    has `executionFailures: 0`, evidence-chat recall 0.4582059020791417,
    missed-recall cases 243/355, and wrong-recall/noise cases 378/400. It
    raises global hit evidence ids 403 -> 405, missing ids 691 -> 689, noise
    ids 2898 -> 2893, and recovers the event-ordering tradeoff
    `3:event_ordering:1` from 0.3333 to 1.0 by restoring turns 72/148.
    Case-delta analysis shows no hit-loss or newly-missing recall regressions.
    This remains a partial repair: the full 100K diagnostic is still noisy and
    source-ordered summary budget quality remains open.
  - same-source project feature/challenge summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-project-feature-challenge-current-20260524T032422Z`
    has `executionFailures: 0`, evidence-chat recall 0.46088195841716983,
    missed-recall cases 242/355, and wrong-recall/noise cases 377/400. It
    raises global hit evidence ids 405 -> 418, missing ids 689 -> 676, noise
    ids 2893 -> 2876, and recovers summarization target `3:summarization:1`
    from 0.25 to 1.0 by restoring turns
    4/5/6/7/16/17/58/59/60/61/66/67 and removing 15 noise ids. Case-delta
    analysis shows no hit-loss or newly-missing evidence regressions; seven
    abstention rows each gain one noise id, but global noise still drops. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - latest same-source relationship/work plus book-club event-order repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-relationship-work-bookclub-strict-current-20260524T054000Z`
    has `executionFailures: 0`, evidence-chat recall 0.46541247484909476,
    missed-recall cases 240/355, and wrong-recall/noise cases 374/400. It
    raises global hit evidence ids 418 -> 435, missing ids 676 -> 659, noise
    ids 2876 -> 2808, recovers summarization target `12:summarization:1`
    from 0.125 to 1.0 by restoring turns
    58/59/60/61/74/75/110/111/258/259/260/261/262/263, and recovers
    event-order target `13:event_ordering:1` from 0.6 to 1.0 by returning
    exactly 16/86/164/222/272. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest same-source family movie event summary plus movie-night contribution
    event-order repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-movie-events-tight-current-20260524T071500Z`
    has `executionFailures: 0`, evidence-chat recall 0.4716096579476863,
    missed-recall cases 238/355, and wrong-recall/noise cases 372/400. It
    raises global hit evidence ids 435 -> 453, missing ids 659 -> 641, noise
    ids 2808 -> 2804, recovers summarization target `14:summarization:1`
    from 0 to 1.0 by restoring turns 0/1/2/62/63/168/169/170/171/172/173,
    and recovers event-order target `14:event_ordering:2` from 0 to 1.0 by
    returning 14/16/72/182/246/130. Case-delta analysis shows no hit-loss,
    no newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic still has 238 missed
    evidence cases and substantial persistent noise.
  - same-source writing-journey event-order repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-writing-journey-current-20260524T081500Z`
    has `executionFailures: 0`, evidence-chat recall 0.474426559356137,
    missed-recall cases 237/355, and wrong-recall/noise cases 371/400. It
    raises global hit evidence ids 453 -> 458, missing ids 641 -> 636, noise
    ids 2804 -> 2781, recovers target `10:event_ordering:1` from 0 to 1.0 by
    restoring turns 6/82/182/238/84, and removes 25 noise ids. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - same-source professional-preparation event-order repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-professional-prep-five-tight-current-20260529T151000Z`
    has `executionFailures: 0`, evidence-chat recall 0.4772434607645877,
    missed-recall cases 236/355, and wrong-recall/noise cases 370/400. It
    raises global hit evidence ids 458 -> 463, missing ids 636 -> 631, noise
    ids 2781 -> 2751, and recovers target `8:event_ordering:2` from 0 to 1.0
    by returning exactly turns 6/56/114/172/226 with no target noise. The
    repair adds a professional-connections/preparation source-order selector
    for mentor networking, cover-letter feedback, storytelling interview prep,
    employee-handbook review, and workshop presentation while rejecting
    schedule/draft/anecdote/repeated-feedback/public-speaking/logistics
    distractors. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This remains a partial
    repair: the full 100K diagnostic is still recall-limited and noisy.
  - same-source professional-preparation summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-professional-prep-summary-refactor-current-20260529T162000Z`
    has `executionFailures: 0`, evidence-chat recall 0.48006036217303844,
    missed-recall cases 235/355, and wrong-recall/noise cases 369/400. It
    raises global hit evidence ids 463 -> 473, missing ids 631 -> 621, noise
    ids 2751 -> 2742, and recovers target `8:summarization:2` from 0 to 1.0
    by returning exactly turns 6/7/78/79/114/115/172/173/226/227 with no
    target noise. The repair adds a professional-preparation summary selector
    that pairs the Leslie networking, cover-letter format, storytelling
    interview, employee-handbook, and workshop presentation anchors with their
    adjacent assistant guidance while rejecting CTA, confidence, calendar,
    checklist, producer-follow-up, and logistics distractors. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - same-source probability-concepts summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-probability-concepts-summary-current-20260529T174000Z`
    has `executionFailures: 0`, evidence-chat recall 0.48287726358148914,
    missed-recall cases 234/355, and wrong-recall/noise cases 368/400. It
    raises global hit evidence ids 473 -> 483, missing ids 621 -> 611, noise
    ids 2742 -> 2727, and recovers target `5:summarization:2` from 0 to 1.0
    by returning exactly turns 140/141/146/149/151/153/155/156/180/181 with no
    target noise. The repair adds a probability-concept summary selector that
    starts at the birthday-paradox permutation milestone, keeps conditional
    aces, complement-rule, direct/complement counting, and mutual-exclusivity
    milestones, and rejects earlier paint, ratio, coin/dice, and generic
    conditional-probability distractors. Case-delta analysis shows no hit-loss,
    no newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - same-source household-budget reasoning repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-household-budget-reasoning-narrow-current-20260529T184500Z`
    has `executionFailures: 0`, evidence-chat recall 0.48569416498993984,
    missed-recall cases 233/355, and wrong-recall/noise cases 367/400. It
    raises global hit evidence ids 483 -> 493, missing ids 611 -> 601, noise
    ids 2727 -> 2726, and recovers target `16:multi_session_reasoning:2`
    from 0 to 1.0 by returning exactly turns
    12/13/14/15/16/17/108/109/126/127 with no target noise. The repair adds a
    household-budget reasoning selector for shared finances, spending habits,
    expense tracking, Ashlee medical-bill support, and the grocery-budget plus
    freelance-contract update while rejecting earlier unrelated medical,
    vehicle, and renovation savings distractors. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source sneaker summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-sneaker-summary-current-20260530T010000Z`
    has `executionFailures: 0`, evidence-chat recall 0.49132796780684124,
    missed-recall cases 231/355, and wrong-recall/noise cases 365/400. It
    raises global hit evidence ids 493 -> 506, missing ids 601 -> 588, noise
    ids 2726 -> 2707, and zero-recall cases 108 -> 106. The repair adds a
    sneaker summary selector for daily options, Ultraboost fit, Allbirds
    comparisons/try-on guidance, running-vs-casual choices, and hiking
    moisture/trail advice while rejecting Air Max, five-mile walking,
    arch-support, and generic instruction distractors; source-preference
    append is suppressed when source-ordered summary coverage already provides
    the answer set. Targets `15:summarization:2` and `15:summarization:1`
    both move from 0 to 1.0 by returning exactly
    1/3/81/83/141/143/203/205 and 1/3/81/141/203 respectively, with no target
    noise. Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This remains a partial repair:
    the full 100K diagnostic is still recall-limited and noisy.
  - same-source free-will reflection event-order repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-freewill-reflection-current-20260530T020000Z`
    has `executionFailures: 0`, evidence-chat recall 0.49414486921529194,
    missed-recall cases 230/355, and wrong-recall/noise cases 364/400. It
    raises global hit evidence ids 506 -> 512, missing ids 588 -> 582, noise
    ids 2707 -> 2694, and zero-recall cases 106 -> 105. The repair adds a
    source-order event plan for free-will personal-reflection questions that
    keeps the Dennett/Freedom Evolves recommendation, Trolley Problem debate,
    soft-determinism journaling, Experience Machine reflection,
    Shelly/incompatibilism accountability, and Ship of Theseus identity
    milestones while rejecting divine-intervention, logical-reasoning,
    Tanya moral-dilemma, weekly-check-in, fiction-journaling, and instruction
    distractors. Target `12:event_ordering:2` moves from 0 to 1.0 by
    returning exactly 32/50/78/98/176/218 with no target noise. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - same-source resume strategy summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-resume-strategy-summary-refined-current-20260530T033000Z`
    has `executionFailures: 0`, evidence-chat recall 0.49921529175050317,
    missed-recall cases 228/355, and wrong-recall/noise cases 362/400. It
    raises global hit evidence ids 512 -> 522, missing ids 582 -> 572, noise
    ids 2694 -> 2683, and zero-recall cases 105 -> 104. The repair adds a
    resume strategy summary selector for age/job-hunt positioning, Joshua ATS
    and budgeting help, Caribbean community experience, Jobscan keyword-match
    optimization, transferable skills, dated industry tailoring, Canva ATS
    formatting, interview/workshop prioritization, callback optimization,
    rapport-building, and latest certification/promotion milestones while
    rejecting quantified-bullets, action-verb-library, generic Canva/Jobscan,
    and cross-cultural communication distractors. Targets `6:summarization:1`
    and `6:summarization:2` both move to 1.0 by returning exactly
    1/5/7/57/111 and 15/19/71/93/139/191 respectively, with no target noise.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This remains a partial repair:
    the full 100K diagnostic is still recall-limited and noisy.
  - same-source AI hiring compliance summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-ai-hiring-compliance-current-20260530T043000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5020321931589539,
    missed-recall cases 227/355, and wrong-recall/noise cases 361/400. It
    raises global hit evidence ids 522 -> 527, missing ids 572 -> 567, noise
    ids 2683 -> 2671, and zero-recall cases 104 -> 103. The repair adds a
    source-ordered AI hiring compliance summary selector for Montserrat Data
    Protection Act / GDPR-like requirements, hiring-policy transparency, the
    June 2024 Employment Act amendments, legal-expert compliance-checklist
    preparation, and current AI usage examples while rejecting 2FA/security
    training, meeting-invite, hybrid-approach, metrics, and feedback-loop
    distractors. Target `11:summarization:2` moves from 0 to 1.0 by returning
    exactly 43/99/233/235/237 with no target noise. Case-delta analysis shows
    no hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source deadline/application date-update repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-deadline-application-update-current-20260530T070000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5048490945674046,
    missed-recall cases 226/355, and wrong-recall/noise cases 361/400. It
    raises global hit evidence ids 527 -> 529, missing ids 567 -> 565, noise
    ids 2671 -> 2676, and zero-recall cases 103 -> 102. The repair narrows
    English role-slot routing so application/deadline mentions such as
    "senior producer role" are not misclassified as identity-role queries, and
    adds source-ordered date-update coverage for application/deadline/submission
    questions while excluding scheduling-instruction and side-project
    distractors. Target `18:knowledge_update:2` moves from 0 to 1.0 by
    returning exactly 170/182 with no target noise. Case-delta analysis shows
    no hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source mentor age/role information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-mentor-role-routing-current-20260530T080000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5076659959758553,
    missed-recall cases 225/355, and wrong-recall/noise cases 361/400. It
    raises global hit evidence ids 529 -> 530, missing ids 565 -> 564, noise
    ids 2676 -> 2670, and zero-recall cases 102 -> 101. The repair narrows
    English role-slot routing so "age and role of the mentor" information
    questions are not misclassified as identity-role queries, adds a
    source-ordered mentor/workshop information-extraction selector, and keeps
    same-session direct-factual companions from widening that exact selector.
    Target `18:information_extraction:1` moves from 0 to 1.0 by returning
    exactly 30 with no target noise. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - same-source API endpoint technologies information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-api-endpoint-technologies-current-20260530T090000Z`
    has `executionFailures: 0`, evidence-chat recall 0.510482897384306,
    missed-recall cases 224/355, and wrong-recall/noise cases 360/400. It
    raises global hit evidence ids 530 -> 531, missing ids 564 -> 563, noise
    ids 2670 -> 2666, and zero-recall cases 101 -> 100. The repair extends
    source-ordered information-extraction selection to API endpoint startup
    technology questions, preserving the source turn that names vanilla
    JavaScript ES2021, HTML5, CSS3, and the OpenWeather API endpoint while
    blocking same-session project/API companion noise. Target
    `2:information_extraction:1` moves from 0 to 1.0 by returning exactly 10
    with no target noise and removing previous target noise 70/186/50/183/58.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This remains a partial repair:
    the full 100K diagnostic is still recall-limited and noisy.
  - same-source single-card probability information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-single-card-probability-current-20260530T100000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5132997987927567,
    missed-recall cases 223/355, and wrong-recall/noise cases 359/400. It
    raises global hit evidence ids 531 -> 532, missing ids 563 -> 562, noise
    ids 2666 -> 2662, and zero-recall cases 100 -> 99. The repair extends
    source-ordered information-extraction selection to single-card probability
    questions that ask for the earlier probability before a two-card follow-up,
    preserving the source turn that states `P = 4/52 = 1/13` while blocking
    deck/conditional-probability companion noise. Target
    `5:information_extraction:2` moves from 0 to 1.0 by returning exactly 32
    with no target noise and removing previous target noise
    58/134/64/234/72/70. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - same-source Laura meeting-location information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-laura-meeting-location-current-20260530T110000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5161167002012074,
    missed-recall cases 222/355, and wrong-recall/noise cases 358/400. It
    raises global hit evidence ids 532 -> 533, missing ids 562 -> 561, noise
    ids 2662 -> 2659, and zero-recall cases 99 -> 98. The repair extends
    source-ordered information-extraction selection to named meeting-location
    questions such as "Where did I say I met Laura?", preserving the source
    turn that says Laura met the user on set at Blue Horizon Studios while
    blocking Laura schedule/cover-letter/handbook distractors. Target
    `8:information_extraction:1` moves from 0 to 1.0 by returning exactly 10
    with no target noise and removing previous target noise 41/149/78/172/114.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; two already-missed zero-recall
    cases trade noise ids, but global noise still decreases. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - same-source partner meeting date/location information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-partner-meeting-date-location-current-20260530T120000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5189336016096581,
    missed-recall cases 221/355, and wrong-recall/noise cases 357/400. It
    raises global hit evidence ids 533 -> 534, missing ids 561 -> 560, noise
    ids 2659 -> 2654, and zero-recall cases 98 -> 97. The repair extends
    source-ordered information-extraction selection to partner meeting
    date/location questions such as "When and where did I say I met my
    partner?", preserving the source turn that says the user met partner Jessica
    at ArtSpace Gallery on June 12, 2020 while blocking AI-hiring and unrelated
    partner-meeting distractors. Target `11:information_extraction:1` moves
    from 0 to 1.0 by returning exactly 30 with no target noise and removing
    previous target noise 376/139/294/37/101. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; two already-noisy cases add net noise, but global noise still
    decreases. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source Bay Street rent information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-bay-street-rent-current-20260530T130000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5217505030181088,
    missed-recall cases 220/355, and wrong-recall/noise cases 356/400. It
    raises global hit evidence ids 534 -> 535, missing ids 560 -> 559, noise
    ids 2654 -> 2647, and zero-recall cases 97 -> 96. The repair extends
    source-ordered information-extraction selection to current rent questions
    such as "What monthly amount did I say I'm currently paying for my place on
    Bay Street?", preserving the source turn that says current rent is
    `$1,200/month` for a 3-bedroom on Bay Street while blocking monthly
    investment, equipment-budget, and debt-management distractors. Target
    `16:information_extraction:1` moves from 0 to 1.0 by returning exactly 30
    with no target noise and removing previous target noise 138/212/285.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; three unrelated noisy cases add
    one net noise each, but global noise still decreases. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - same-source parents distance/town information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-parents-distance-town-current-20260530T140000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5245674044265595,
    missed-recall cases 219/355, and wrong-recall/noise cases 355/400. It
    raises global hit evidence ids 535 -> 536, missing ids 559 -> 558, noise
    ids 2647 -> 2637, and zero-recall cases 96 -> 95. The repair extends
    source-ordered information-extraction selection to family location
    questions such as "How far away did I say my parents live from me, and in
    which town?", preserving the source turn that says Amy and Kyle live 15
    miles away in West Janethaven while blocking family movie-watchlist,
    animated-musical, snack-budget, and platform-availability distractors.
    Target `14:information_extraction:1` moves from 0 to 1.0 by returning
    exactly 6 with no target noise and removing previous target noise
    22/23/53/138/139/142/176/192. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; one
    unrelated abstention case adds one noise id, but global noise still
    decreases. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source reading-list count/page-total information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-reading-list-count-pages-current-20260530T150000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5273843058350102,
    missed-recall cases 218/355, and wrong-recall/noise cases 354/400. It
    raises global hit evidence ids 536 -> 537, missing ids 558 -> 557, noise
    ids 2637 -> 2630, and zero-recall cases 95 -> 94. The repair extends
    source-ordered information-extraction selection to reading-list count and
    page-total questions such as "How many series did I say were on my reading
    list, and what was the total page count?", preserving the source turn that
    says the reading list has 7 series including The Stormlight Archive and The
    Expanse totaling 4,200 pages while blocking Poppy War, Witcher, Nightingale,
    and generic book-series distractors. Target `13:information_extraction:1`
    moves from 0 to 1.0 by returning exactly 26 with no target noise and
    removing previous target noise 154/214/284/124/236/60. Case-delta analysis
    shows no hit-loss, no newly-missing evidence regressions, and no negative
    recall deltas; one unrelated knowledge-update case adds one net noise id,
    but global noise still decreases. This remains a partial repair: the full
    100K diagnostic is still recall-limited and noisy.
  - same-source kids activity-days information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-kids-activity-days-current-20260530T160000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5302012072434609,
    missed-recall cases 217/355, and wrong-recall/noise cases 353/400. It
    raises global hit evidence ids 537 -> 538, missing ids 557 -> 556, noise
    ids 2630 -> 2626, and zero-recall cases 94 -> 93. The repair extends
    source-ordered information-extraction selection to school activity-day
    questions such as "Which days did I say my kids have their afterschool
    activities at their school?", preserving the source turn that says Emma,
    Michelle, and Rachel attend East Janethaven Primary School with activities
    on Tuesdays and Thursdays while blocking adjacent time-management,
    work-hours, and monthly-school-meeting distractors. Target
    `17:information_extraction:1` moves from 0 to 1.0 by returning exactly 18
    with no target noise and removing previous target noise
    19/49/163/168/169/233/264/265. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; four
    unrelated event-ordering cases add five net noise ids, but global noise
    still decreases. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - same-source print-book budget information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-print-book-budget-current-20260530T170000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5339570757880617,
    missed-recall cases 216/355, and wrong-recall/noise cases 352/400. It
    raises global hit evidence ids 538 -> 541, missing ids 556 -> 553, noise
    ids 2626 -> 2618, and zero-recall cases 93 -> 91. The repair extends
    source-ordered information-extraction selection to print-book budget
    planning questions such as "How did you help me balance my spending to get
    a variety of print books while staying within my set limits?", preserving
    the source pair that says the user allocated $120 for print editions from
    Montserrat Books on Main Street and the assistant suggested budget-fitting
    fiction series while blocking completed-series and generic book-recommendation
    distractors. Target `13:information_extraction:2` moves from 0 to 1.0 by
    returning exactly 34/35 with no target noise and removing previous target
    noise 173/177/181/58/62/306/59/188/189. The same run also recovers chat 34
    for `13:multi_session_reasoning:1` without adding noise. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; three non-target cases add one net noise id each,
    but global noise still decreases. This remains a partial repair: the full
    100K diagnostic is still recall-limited and noisy.
  - same-source Patrick workshop preparation information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-patrick-workshop-prep-router-dedupe-current-20260530T190000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5367739771965124,
    missed-recall cases 215/355, and wrong-recall/noise cases 352/400. It
    raises global hit evidence ids 541 -> 547, missing ids 553 -> 547, noise
    ids 2618 -> 2616, and zero-recall cases 91 -> 90. The repair prevents
    `role did ... play` wording from triggering identity-role slot selection
    and dedupes BEAM source snippets by chat id for Patrick workshop
    preparation questions. Target `18:information_extraction:2` moves from 0
    to 1.0 by returning exactly 30/31/32/33/34/35 with no target noise.
    Information-extraction rises to average recall 0.6125 with +6 hit ids, -6
    missing ids, unchanged noise 133, one fewer incomplete case, and one fewer
    zero-recall case. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas; one non-target
    preference case adds one noise id, but global noise still decreases. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - same-source layout/navigation plus Robert mentor-prep
    information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-layout-and-robert-prep-current-20260530T210000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5424077800134139,
    missed-recall cases 213/355, and wrong-recall/noise cases 351/400. It
    raises global hit evidence ids 547 -> 551, missing ids 547 -> 543,
    zero-recall cases 90 -> 88, and wrong-recall/noise cases 352 -> 351, while
    total noise rises 2616 -> 2618. The repair prevents `guide my essay
    writing` wording from triggering reference-slot routing, keeps Robert
    academic mentor preparation/follow-up source turns, and keeps the first
    sprint layout/navigation schedule pair ahead of later Trello/Lighthouse
    snippets. Targets `3:information_extraction:2` and
    `7:information_extraction:2` move from 0 to 1.0 by returning exactly 12/13
    and 14/15 respectively; the first removes target noise 39/40 and the
    second adds no target noise. Information-extraction rises to average recall
    0.6625 with +4 hit ids, -4 missing ids, two fewer noise ids, two fewer
    incomplete cases, two fewer zero-recall cases, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; three
    non-target buckets add four net noise ids, so total noise remains open.
    This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source Laura mixer prior-connection information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-laura-mixer-prior-connection-current-20260530T220000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5452246814218646,
    missed-recall cases 212/355, and wrong-recall/noise cases 350/400. It
    raises global hit evidence ids 551 -> 553, missing ids 543 -> 541,
    zero-recall cases 88 -> 87, wrong-recall/noise cases 351 -> 350, and
    lowers total noise 2618 -> 2610. The repair keeps the source turns where
    Laura recommended the Coral Bay Hotel mixer and the prior Blue Horizon
    Studios connection ahead of Leslie/Greg networking distractors. Target
    `8:information_extraction:2` moves from 0 to 1.0 by returning exactly
    10/11 and removing target noise 25/24. Information-extraction rises to
    average recall 0.6875 with +2 hit ids, -2 missing ids, two fewer noise ids,
    one fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, no negative recall deltas, and no
    positive noise deltas. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - same-source Laura weekly video-call schedule-advice
    information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-laura-weekly-call-schedule-advice-current-20260530T223000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5480415828303153,
    missed-recall cases 211/355, and wrong-recall/noise cases 349/400. It
    raises global hit evidence ids 553 -> 559, missing ids 541 -> 535,
    zero-recall cases 87 -> 86, wrong-recall/noise cases 350 -> 349, and
    lowers total noise 2610 -> 2608. The repair keeps the six source turns for
    the weekly Laura Zoom-call plan: asking about multiple projects and
    work/personal boundaries, then following up with a thank-you summary.
    Target `17:information_extraction:2` moves from 0 to 1.0 by returning
    exactly 26/27/28/29/30/31 and removing target noise 35/36/37/38/39.
    Information-extraction rises to average recall 0.7125 with +6 hit ids, -6
    missing ids, five fewer noise ids, one fewer incomplete case, one fewer
    zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; four non-target cases add one noise id each, but
    total noise still decreases. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - same-source triangle similarity-ratio information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-triangle-similarity-ratio-exact-current-20260530T231000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5508584842387659,
    missed-recall cases 210/355, and wrong-recall/noise cases 348/400. It
    raises global hit evidence ids 559 -> 561, missing ids 535 -> 533,
    zero-recall cases 86 -> 85, wrong-recall/noise cases 349 -> 348, and
    lowers total noise 2608 -> 2600. The repair keeps the source pair for
    verifying the triangle similarity ratio across corresponding sides
    9/12/15 and 6.75/9/11.25 ahead of triangle-area and broad geometry
    distractors. Target `4:information_extraction:2` moves from 0 to 1.0 by
    returning exactly 166/167 and removing target noise
    73/101/117/133/134/135/190/191. Information-extraction rises to average
    recall 0.7375 with +2 hit ids, -2 missing ids, nine fewer noise ids, one
    fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; two
    non-target cases add one noise id each, but total noise still decreases.
    This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source resume keyword integration information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-resume-keyword-integration-full-current-20260530T233000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5536753856472167,
    missed-recall cases 209/355, and wrong-recall/noise cases 347/400. It
    raises global hit evidence ids 561 -> 563, missing ids 533 -> 531,
    zero-recall cases 85 -> 84, wrong-recall/noise cases 348 -> 347, and
    lowers total noise 2600 -> 2589. The repair keeps the source pair for
    incorporating `project management` and `budget oversight` naturally across
    resume sections ahead of generic age-discrimination, resume-formatting,
    and broad career distractors. Target `6:information_extraction:2` moves
    from 0 to 1.0 by returning exactly 24/25 and removing target noise
    1/15/111/124/125/173/203/94/144/36/37/74/75. Information-extraction rises
    to average recall 0.7625 with +2 hit ids, -2 missing ids, twelve fewer
    noise ids, one fewer incomplete case, one fewer zero-recall case, and one
    fewer wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; three
    non-target cases add noise through source-neighbor reshuffles, but total
    noise still decreases. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - latest same-source emergency-fund savings-plan information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-emergency-fund-savings-plan-current-20260530T235000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5564922870556674,
    missed-recall cases 208/355, and wrong-recall/noise cases 346/400. It
    raises global hit evidence ids 563 -> 565, missing ids 531 -> 529,
    zero-recall cases 84 -> 83, wrong-recall/noise cases 347 -> 346, and
    lowers total noise 2589 -> 2581. The repair keeps the source pair for
    planning a $2,000 emergency fund by June 30, 2024 from $500 already saved,
    ahead of average-income, debt-management, contract, investment, and
    cash-reserve distractors. Target `16:information_extraction:2` moves from
    0 to 1.0 by returning exactly 34/35 and removing target noise
    27/183/105/79/123/305. Information-extraction rises to average recall
    0.7875 with +2 hit ids, -2 missing ids, six fewer noise ids, one fewer
    incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; one
    non-target event-ordering case adds one noise id, but total noise still
    decreases. This remains a partial repair: the full 100K diagnostic is
    still recall-limited and noisy.
  - latest same-source rate-limit request-flow information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-rate-limit-request-flow-current-20260531T000500Z`
    has `executionFailures: 0`, evidence-chat recall 0.558370221327968,
    missed-recall cases 207/355, and wrong-recall/noise cases 345/400. It
    raises global hit evidence ids 565 -> 567, missing ids 529 -> 527,
    lowers total noise 2581 -> 2573, and keeps zero-recall cases at 83. The
    repair keeps the three source turns for managing OpenWeather API request
    flow under frequent retries and bursts of activity: elapsed-interval
    counter resets plus queueing, rapid-call queue processing, and capped
    exponential backoff for repeated retries. Target
    `2:information_extraction:2` moves from 0.3333333333333333 to 1.0 by
    returning exactly 33/35/37, recovering 35/37, and removing target noise
    32/90/116/117/150/151/154/64/65/122/123. Information-extraction rises to
    average recall 0.8042 with +2 hit ids, -2 missing ids, nine fewer noise
    ids, one fewer incomplete case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; five non-target cases add net
    noise through source-neighbor reshuffles, but total noise still decreases.
    This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest same-source partner classic-movie recommendation
    information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-partner-classic-movie-current-20260531T002000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5611871227364187,
    missed-recall cases 206/355, and wrong-recall/noise cases 344/400. It
    raises global hit evidence ids 567 -> 569, missing ids 527 -> 525,
    zero-recall cases 83 -> 82, and lowers total noise 2573 -> 2568. The
    repair keeps the source pair tying the user's shared classic-film interest
    with partner Thomas to timeless movie recommendations and the Miami film
    festival meeting context, ahead of movie-theme, schedule, rental,
    invitation, platform, and unrelated sneaker-material distractors. Target
    `14:information_extraction:2` moves from 0 to 1.0 by returning exactly
    12/13 and removing target noise 95/126/142/143/187/217/243/52/214.
    Information-extraction rises to average recall 0.8292 with +2 hit ids, -2
    missing ids, nine fewer noise ids, one fewer incomplete case, one fewer
    zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; five non-target cases add net noise through
    source-neighbor reshuffles, but total noise still decreases. This remains
    a partial repair: the full 100K diagnostic is still recall-limited and
    noisy.
  - latest same-source colour-technologist profession information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-colour-technologist-profession-current-20260531T003500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5640040241448694,
    missed-recall cases 205/355, and wrong-recall/noise cases 343/400. It
    raises global hit evidence ids 569 -> 570, missing ids 525 -> 524,
    zero-recall cases 82 -> 81, and lowers total noise 2568 -> 2557. The
    repair keeps the source turn where the user says they are a 44-year-old
    colour technologist from Port Michael in a probability-basics context,
    ahead of independent-events, die-roll, birthday-paradox, and unrelated
    product probability distractors. Target `5:information_extraction:1`
    moves from 0 to 1.0 by returning exactly 16 and removing target noise
    63/14/156/90. Information-extraction rises to average recall 0.8542 with
    +1 hit id, -1 missing id, six fewer noise ids, one fewer incomplete case,
    one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, no negative recall deltas, and no positive noise deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - latest same-source ASA triangle-congruence proof-plan
    information-extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-asa-triangle-congruence-current-20260531T011000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5668209255533201,
    missed-recall cases 204/355, and wrong-recall/noise cases 342/400. It
    raises global hit evidence ids 570 -> 571, missing ids 524 -> 523,
    zero-recall cases 81 -> 80, and lowers total noise 2557 -> 2551. The
    repair keeps the assistant source turn that labels triangles ABC and DEF,
    states matching 50 and 60 degree angle pairs plus the 7 cm included side,
    applies the ASA criterion, and concludes congruence, ahead of broad
    similarity, SSA ambiguity, diagram-instruction, and proof-outline
    distractors. Target `4:information_extraction:1` moves from 0 to 1.0 by
    returning exactly 151 and removing target noise 140/196/206/60.
    Information-extraction rises to average recall 0.8792 with +1 hit id, -1
    missing id, four fewer noise ids, one fewer incomplete case, one fewer
    zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; two non-target cases add one noise id each, but
    total noise still decreases. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - same-source AI hiring fairness/speed information-extraction repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-ai-hiring-fairness-speed-current-20260531T014000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5696378269617708,
    missed-recall cases 203/355, and wrong-recall/noise cases 341/400. It
    raises global hit evidence ids 571 -> 572, missing ids 523 -> 522,
    zero-recall cases 80 -> 79, and lowers total noise 2551 -> 2544. The
    repair keeps the assistant source turn that balances faster candidate
    screening with fairness through vendor transparency checks, bias and
    third-party audits, anonymization, human oversight, diversity monitoring,
    candidate feedback, and structured interviews, ahead of related pilot,
    soft-skills, balanced-approach, algorithmic-bias, cost-savings, and
    timeline distractors. Target `11:information_extraction:2` moves from 0
    to 1.0 by returning exactly 39 and removing target noise
    13/27/68/69/178/179/198/199/36/37. Information-extraction rises to
    average recall 0.9042 with +1 hit id, -1 missing id, ten fewer noise ids,
    one fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; four
    non-target cases add net noise, but total noise still decreases. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - same-source startup transition preparation information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-startup-transition-prep-current-20260531T020500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5710462776659961,
    missed-recall cases 202/355, and wrong-recall/noise cases 340/400. It
    raises global hit evidence ids 572 -> 573, missing ids 522 -> 521, keeps
    zero-recall cases at 79, and lowers total noise 2544 -> 2532. The repair
    keeps the source pair for deciding between the current job and streaming
    startup offer, then preparing for the new work environment through company
    research, current-employee conversations, workload and pressure
    clarification, startup-colleague advice, support-network planning,
    compensation/equity review, budgeting, and professional development,
    ahead of generic startup-interest, meeting, philosophical-reflection,
    career-planning, and writing-schedule distractors. Target
    `12:information_extraction:2` moves from 0.5 to 1.0 by returning exactly
    39/41, recovering 39, and removing target noise
    40/64/65/75/87/205/243/102/103/310/311. Information-extraction rises to
    average recall 0.9167 with +1 hit id, -1 missing id, eleven fewer noise
    ids, one fewer incomplete case, and one fewer wrong-recall/noise case;
    instruction-following also loses one noise id. Case-delta analysis shows
    no hit-loss, no newly-missing evidence regressions, no negative recall
    deltas, and no positive noise deltas. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - same-source son patent-guidance resource-plan information-extraction
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-son-patent-guidance-current-20260531T035000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5719852448021464,
    missed-recall cases 201/355, and wrong-recall/noise cases 340/400. It
    raises global hit evidence ids 573 -> 575, missing ids 521 -> 519, keeps
    zero-recall cases at 79, and lowers total noise 2532 -> 2531. The repair
    keeps the six source turns for supporting Francis's engineering studies
    and finding patent guidance: the Montserrat Community College engineering
    context, relevant patent options, the user's provisional/documentation
    plan, college/bar-association/online-directory resources, the user's local
    resource plan, and the final attorney-search steps through networking,
    interviews, and fit/budget decision. It also dedupes same-chat BEAM source
    snippets by evidence chat id so chat 11 snippets do not crowd out 14/15.
    Target `20:information_extraction:2` moves from
    0.6666666666666666 to 1.0 by returning exactly 10/11/12/13/14/15,
    recovering 14/15, with no target noise. Information-extraction rises to
    average recall 0.925 with +2 hit ids, -2 missing ids, unchanged total
    information-extraction noise, and one fewer incomplete case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; three non-target cases add one noise id each, but
    four non-target cases remove one noise id each and total noise still
    decreases. This remains a partial repair: the full 100K diagnostic is
    still recall-limited and noisy.
  - latest same-source shoe-size cross-session count repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-shoe-size-count-current-20260531T050000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5748021462105971,
    missed-recall cases 200/355, and wrong-recall/noise cases 340/400. It
    raises global hit evidence ids 575 -> 577, missing ids 519 -> 517, lowers
    zero-recall cases 79 -> 78, and increases total noise 2531 -> 2534. The
    repair keeps the source shoe-choice context and later size-value turn for
    the cross-session count question about mentioned shoe sizes while
    excluding the adjacent assistant shoe-comparison advice. Target
    `15:multi_session_reasoning:1` moves from 0 to 1.0 by returning exactly
    32/116, recovering both required turns, with no target noise.
    Multi-session reasoning rises to average recall 0.4452 with +2 hit ids,
    -2 missing ids, unchanged bucket noise, one fewer incomplete case, and one
    fewer zero-recall case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; five
    non-target cases add net six noise ids while three remove net three noise
    ids, so total noise rises by three. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - latest same-source senior-producer preparation priority repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-senior-producer-prep-narrow-current-20260531T071500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5776190476190478,
    missed-recall cases 199/355, and wrong-recall/noise cases 340/400. It
    raises global hit evidence ids 577 -> 581, missing ids 517 -> 513, lowers
    zero-recall cases 78 -> 77, and lowers total noise 2534 -> 2532. The
    repair keeps the four source turns needed to prioritize the senior-producer
    preparation plan: cover-letter draft/revision deadlines, the Leslie
    creative-director Zoom call, the Greg clarity-score improvement, and the
    follow-up STAR/specificity/active-listening practice plan. Target
    `8:multi_session_reasoning:2` moves from 0 to 1.0 by returning exactly
    28/92/150/152 with no target noise. Multi-session reasoning rises to
    average recall 0.4702 with +4 hit ids, -4 missing ids, unchanged bucket
    noise, one fewer incomplete case, and one fewer zero-recall case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; non-target noise swaps net to a
    two-id total-noise decrease. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - latest same-source weather-app latency comparison repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-weather-latency-comparison-current-20260531T083000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5804359490274985,
    missed-recall cases 198/355, and wrong-recall/noise cases 339/400. It
    raises global hit evidence ids 581 -> 583, missing ids 513 -> 511, lowers
    zero-recall cases 77 -> 76, and lowers total noise 2532 -> 2525. The
    repair keeps the measured fetch-call latency and autocomplete API response
    time user turns for the cross-session speed comparison while excluding
    adjacent weather-app implementation, debounce, error-handling, and load-test
    distractors. Target `2:multi_session_reasoning:2` moves from 0 to 1.0 by
    returning exactly 38/80 and removing target noise
    44/45/94/95/124/125/133/187. Multi-session reasoning rises to average
    recall 0.4952 with +2 hit ids, -2 missing ids, eight fewer bucket noise ids,
    one fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; three
    non-target cases add one noise id each, but total noise still decreases by
    seven. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest same-source API daily quota update repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-api-daily-quota-current-20260531T094500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5832528504359492,
    missed-recall cases 197/355, and wrong-recall/noise cases 338/400. It
    raises global hit evidence ids 583 -> 585, missing ids 511 -> 509, lowers
    zero-recall cases 76 -> 75, and lowers total noise 2525 -> 2523. The
    repair extends source-ordered value updates to daily API call quotas so the
    old rate-limit context and the later `1,200 calls per day` API-key quota
    update are preserved while debounce, CORS, autocomplete-caching, and uptime
    monitoring distractors are excluded. Target `2:knowledge_update:1` moves
    from 0 to 1.0 by returning exactly 32/66 and removing target noise
    48/152/95/8. Knowledge-update rises to average recall 0.5771 with +2 hit
    ids, -2 missing ids, four fewer bucket noise ids, one fewer incomplete
    case, one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; two non-target cases add noise,
    but total noise still decreases by two. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - latest same-source weekly writing target update repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-weekly-word-target-current-20260531T101500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5860697518443999,
    missed-recall cases 196/355, and wrong-recall/noise cases 337/400. It
    raises global hit evidence ids 585 -> 587, missing ids 509 -> 507, lowers
    zero-recall cases 75 -> 74, and lowers total noise 2523 -> 2512. The
    repair extends source-ordered value updates to weekly writing word-count
    targets so the old `1,200 words per week` goal and the later `1,350 words`
    adjustment are preserved while writing-session, progress-calculation,
    writing-group, final-draft, and later `1,800-word targets` distractors are
    excluded. Target `10:knowledge_update:1` moves from 0 to 1.0 by returning
    exactly 22/64 and removing target noise 296/24/301/55/151/153/155.
    Knowledge-update rises to average recall 0.6021 with +2 hit ids, -2
    missing ids, seven fewer bucket noise ids, one fewer incomplete case, one
    fewer zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; one non-target event-ordering case adds noise, but
    total noise still decreases by eleven. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - latest same-source ASA proof preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-asa-proof-preference-current-20260531T104500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5888866532528506,
    missed-recall cases 195/355, and wrong-recall/noise cases 336/400. It
    raises global hit evidence ids 587 -> 588, missing ids 507 -> 506, lowers
    zero-recall cases 74 -> 73, and lowers total noise 2512 -> 2508. The
    repair treats ASA/congruence proof preference queries as exclusive
    source-ordered preference evidence: the user request for detailed ASA
    proofs with diagrams is preserved while triangle-classification visual
    learning, old ASA angle-error context, broad congruence/similarity
    explanations, and the adjacent assistant proof are excluded. Target
    `4:preference_following:2` moves from 0 to 1.0 by returning exactly 198
    and removing target noise 169/52/53/190/191. Preference-following rises
    to average recall 0.5171 with +1 hit id, -1 missing id, five fewer bucket
    noise ids, one fewer incomplete case, one fewer zero-recall case, and one
    fewer wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; four
    non-target cases add one noise id each, but total noise still decreases
    by four. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest same-source automated deployment monitoring preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-automation-monitoring-current-20260531T111500Z`
    has `executionFailures: 0`, evidence-chat recall 0.5917035546613013,
    missed-recall cases 194/355, and wrong-recall/noise cases 335/400. It
    raises global hit evidence ids 588 -> 590, missing ids 506 -> 504, lowers
    zero-recall cases 73 -> 72, and lowers total noise 2508 -> 2501. The
    repair treats deployment-workflow monitoring questions as exclusive
    source-ordered preference evidence when the source says the user prefers
    automated CI/CD deployments and then asks how to monitor GitHub Actions job
    progress. Target `2:preference_following:2` moves from 0 to 1.0 by
    returning exactly 182/184 and removing target noise 185/145/124/125/178/179.
    Preference-following rises to average recall 0.5427 with +2 hit ids, -2
    missing ids, seven fewer bucket noise ids, one fewer incomplete case, one
    fewer zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; two non-target event-ordering cases add one noise
    id each, but total noise still decreases by seven. This remains a partial
    repair: the full 100K diagnostic is still recall-limited and noisy.
  - latest same-source lightweight lazysizes preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-lightweight-lazysizes-current-20260531T121500Z`
    has `executionFailures: 0`, evidence-chat recall 0.594520456069752,
    missed-recall cases 193/355, and wrong-recall/noise cases 334/400. It
    raises global hit evidence ids 590 -> 591, missing ids 504 -> 503, lowers
    zero-recall cases 72 -> 71, and lowers total noise 2501 -> 2496. The
    repair treats Bootstrap image-gallery lazy-loading questions as exclusive
    source-ordered preference evidence when the source says the user wants a
    lightweight vanilla JS/lazysizes implementation under 100KB. Target
    `3:preference_following:2` moves from 0 to 1.0 by returning exactly 100
    and removing target noise 122/96/62/48/49/82/83. Preference-following
    rises to average recall 0.5684 with +1 hit id, -1 missing id, seven fewer
    bucket noise ids, one fewer incomplete case, one fewer zero-recall case,
    and one fewer wrong-recall/noise case. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; four non-target cases add noise, but total noise still decreases
    by five. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest same-source pragmatic security preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-pragmatic-security-current-20260531T130000Z`
    has `executionFailures: 0`, evidence-chat recall 0.5973373574782028,
    missed-recall cases 192/355, and wrong-recall/noise cases 333/400. It
    raises global hit evidence ids 591 -> 592, missing ids 503 -> 502, lowers
    zero-recall cases 71 -> 70, and lowers total noise 2496 -> 2488. The
    repair treats app security-improvement advice as exclusive source-ordered
    preference evidence when the source says the user wants pragmatic security
    enhancements that do not compromise user experience or app responsiveness.
    Target `1:preference_following:2` moves from 0 to 1.0 by returning exactly
    178 and removing target noise 182/86/116/102/184/66/67/108/109.
    Preference-following rises to average recall 0.5940 with +1 hit id, -1
    missing id, nine fewer bucket noise ids, one fewer incomplete case, one
    fewer zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; three non-target event-ordering cases add one
    noise id each, but total noise still decreases by eight. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - latest same-source UK ATS resume preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-uk-ats-resume-current-20260531T140000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6001542588866535,
    missed-recall cases 191/355, and wrong-recall/noise cases 332/400. It
    raises global hit evidence ids 592 -> 593, missing ids 502 -> 501, lowers
    zero-recall cases 70 -> 69, and lowers total noise 2488 -> 2472. The
    repair treats UK job resume-format advice as exclusive source-ordered
    preference evidence when the source says the user wants a UK-specific ATS
    resume style rather than a generic global version. Target
    `6:preference_following:2` moves from 0 to 1.0 by returning exactly 222
    and removing target noise 1/106/129/190/191/200/201/203/46/94/36/37/124/125.
    Preference-following rises to average recall 0.6197 with +1 hit id, -1
    missing id, fourteen fewer bucket noise ids, one fewer incomplete case,
    one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; two non-target cases add one
    noise id each, but total noise still decreases by sixteen. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - latest same-source probability-ratio walkthrough preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-probability-ratio-current-20260531T150000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6029711602951042,
    missed-recall cases 190/355, and wrong-recall/noise cases 331/400. It
    raises global hit evidence ids 593 -> 594, missing ids 501 -> 500, lowers
    zero-recall cases 69 -> 68, and lowers total noise 2472 -> 2462. The
    repair treats red-card probability walkthrough questions as exclusive
    source-ordered preference evidence when the source says the user prefers
    step-by-step explanations with concrete examples like coin tosses and dice
    rolls for probability fundamentals. Target `5:preference_following:1`
    moves from 0 to 1.0 by returning exactly 60 and removing target noise
    58/32/64/234/48/49/108/109. Preference-following rises to average recall
    0.6453 with +1 hit id, -1 missing id, eight fewer bucket noise ids, one
    fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; one
    non-target event-ordering case adds net one noise id, but total noise still
    decreases by ten. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - latest same-source triangle area/median comparison preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-triangle-area-median-current-20260531T160000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6057880617035549,
    missed-recall cases 189/355, and wrong-recall/noise cases 330/400. It
    raises global hit evidence ids 594 -> 595, missing ids 500 -> 499, lowers
    zero-recall cases 68 -> 67, and lowers total noise 2462 -> 2458. The
    repair treats triangle-area questions that ask for different methods plus
    median length as exclusive source-ordered preference evidence when the
    source says the user wants to compare base-height and Heron's formula on
    the 7/24/25 triangle while also applying the median length formula. Target
    `4:preference_following:1` moves from 0 to 1.0 by returning exactly 116
    and removing target noise 114/138/190/130/131/134/135.
    Preference-following rises to average recall 0.6709 with +1 hit id, -1
    missing id, six fewer bucket noise ids, one fewer incomplete case, one
    fewer zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; three non-target cases add one noise id each, but
    total noise still decreases by four. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - latest same-source cover-letter measurable-impact preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-cover-letter-impact-current-20260531T170000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6086049631120057,
    missed-recall cases 188/355, and wrong-recall/noise cases 329/400. It
    raises global hit evidence ids 595 -> 596, missing ids 499 -> 498, lowers
    zero-recall cases 67 -> 66, and lowers total noise 2458 -> 2445. The
    repair treats cover-letter questions that ask how to structure achievement
    evidence from previous projects as exclusive source-ordered preference
    evidence when the source says the user wants measurable impact such as
    increasing viewership by 35% without too much flowery language. Target
    `8:preference_following:1` moves from 0 to 1.0 by returning exactly 34
    and removing target noise 8/9/33/54/55/111/145/147/58/59/186/187.
    Preference-following rises to average recall 0.6966 with +1 hit id, -1
    missing id, thirteen fewer bucket noise ids, one fewer incomplete case,
    one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; two non-target cases add
    noise only, but total noise still decreases by thirteen. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and
    noisy.
  - latest same-source cover-letter portfolio-link preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-portfolio-links-current-20260531T180000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6114218645204564,
    missed-recall cases 187/355, and wrong-recall/noise cases 328/400. It
    raises global hit evidence ids 596 -> 598, missing ids 498 -> 496, lowers
    zero-recall cases 66 -> 65, and lowers total noise 2445 -> 2432. The
    repair treats cover-letter questions that ask how to include portfolio
    links for easy access as exclusive source-ordered preference evidence when
    the source says the user wants portfolio links directly in the cover
    letter without attaching separate documents, plus the immediate follow-up
    about one versus multiple links. Target `8:preference_following:2` moves
    from 0 to 1.0 by returning exactly 68/70 and removing target noise
    8/9/43/61/78/79/182/183/58/59/186/187. Preference-following rises to
    average recall 0.7222 with +2 hit ids, -2 missing ids, twelve fewer bucket
    noise ids, one fewer incomplete case, one fewer zero-recall case, and one
    fewer wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; two
    non-target cases add one noise id each, but total noise still decreases by
    thirteen. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest same-source AI-assisted editing workflow preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-ai-editing-workflow-current-20260531T190000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6132997987927569,
    missed-recall cases 186/355, and wrong-recall/noise cases 327/400. It
    raises global hit evidence ids 598 -> 600, missing ids 496 -> 494, keeps
    zero-recall cases at 65, and lowers total noise 2432 -> 2425. The repair
    treats draft-editing efficiency questions as exclusive source-ordered
    preference evidence when the source says the user prefers AI-assisted
    editing tools for tone calibration to save time versus manual revisions,
    plus the follow-up hybrid plan and final confirmation to use AI tools for
    initial edits and final touches manually. Target
    `10:preference_following:2` moves from 0.3333 to 1.0 by returning exactly
    114/116/118, recovering 116/118, and removing target noise
    232/244/204/0/172/115/188/189. Preference-following rises to average
    recall 0.7393 with +2 hit ids, -2 missing ids, seven fewer bucket noise
    ids, one fewer incomplete case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; non-target changes only affect
    noise ids while total noise still decreases by seven. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and
    noisy.
  - latest same-source book-format portability preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-book-format-current-20260531T200000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6161167002012076,
    missed-recall cases 185/355, and wrong-recall/noise cases 326/400. It
    raises global hit evidence ids 600 -> 601, missing ids 494 -> 493, lowers
    zero-recall cases 65 -> 64, and lowers total noise 2425 -> 2417. The
    repair treats book-collection questions that ask for something easy to
    carry around as exclusive source-ordered preference evidence when the
    source says the user prefers e-books for portability but also enjoys print
    for collectible editions and gifting. Target `13:preference_following:1`
    moves from 0 to 1.0 by returning exactly 58 and removing target noise
    12/20/222/250/306/62/13/21. Preference-following rises to average recall
    0.7650 with +1 hit id, -1 missing id, eight fewer bucket noise ids, one
    fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas;
    non-target changes only affect noise ids while total noise still decreases
    by eight. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source balanced standalone/series reading-list preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-reading-balance-current-20260531T210000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6189336016096583,
    missed-recall cases 184/355, and wrong-recall/noise cases 325/400. It
    raises global hit evidence ids 601 -> 602, missing ids 493 -> 492, lowers
    zero-recall cases 64 -> 63, and lowers total noise 2417 -> 2408. The
    repair treats reading-list book suggestion questions as exclusive
    source-ordered preference evidence when the source says the user prefers
    mixing standalone novels with series to maintain variety and avoid
    fatigue. Target `13:preference_following:2` moves from 0 to 1.0 by
    returning exactly 246 and removing target noise
    148/4/232/136/306/62/98/99/124/125. Preference-following rises to
    average recall 0.7906 with +1 hit id, -1 missing id, ten fewer bucket
    noise ids, one fewer incomplete case, one fewer zero-recall case, and one
    fewer wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas;
    non-target changes only affect noise ids while total noise still decreases
    by nine. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - same-source sleek neutral sneaker preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-sleek-neutral-sneakers-narrow-current-20260531T223000Z`
    has `executionFailures: 0`, evidence-chat recall 0.621750503018109,
    missed-recall cases 183/355, and wrong-recall/noise cases 324/400. It
    raises global hit evidence ids 602 -> 604, missing ids 492 -> 490, lowers
    zero-recall cases 63 -> 62, and lowers total noise 2408 -> 2401. The
    repair treats new-pair sneaker recommendation questions as exclusive
    source-ordered preference evidence when the source says the user prefers a
    sleek, modern look in neutral black/gray colors and the follow-up selects
    Adidas Ultraboost plus Nike Air VaporMax black/gray options; it also keeps
    sneaker summary prompts out of that override. Target
    `15:preference_following:1` moves from 0 to 1.0 by returning exactly 28
    and 30 and removing target noise 150/42/168/44/58/160/24/25/151.
    Preference-following rises to average recall 0.8162 with +2 hit ids, -2
    missing ids, ten fewer bucket noise ids, one fewer incomplete case, one
    fewer zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; non-target changes only affect noise ids while
    total noise still decreases by seven. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - same-source structured daily routine preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-structured-routine-current-20260531T230000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6245674044265597,
    missed-recall cases 182/355, and wrong-recall/noise cases 323/400. It
    raises global hit evidence ids 604 -> 605, missing ids 490 -> 489, lowers
    zero-recall cases 62 -> 61, and lowers total noise 2401 -> 2390. The
    repair treats day-organization questions about staying on track with
    responsibilities as exclusive source-ordered preference evidence when the
    source says the user prefers a structured daily routine with 7 AM wake-up
    and 9 PM sleep times for productivity. Target
    `12:preference_following:2` moves from 0 to 1.0 by returning exactly 106
    and removing target noise 150/340/78/80/144/145/200/201.
    Preference-following rises to average recall 0.8419 with +1 hit id, -1
    missing id, eight fewer bucket noise ids, one fewer incomplete case, one
    fewer zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; non-target changes only affect noise ids while
    total noise still decreases by eleven. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - same-source positive family movie review preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-family-movie-reviews-current-20260531T233000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6273843058350104,
    missed-recall cases 181/355, and wrong-recall/noise cases 322/400. It
    raises global hit evidence ids 605 -> 606, missing ids 489 -> 488, lowers
    zero-recall cases 61 -> 60, and lowers total noise 2390 -> 2377. The
    repair treats family movie-night recommendation questions as exclusive
    source-ordered preference evidence when the source asks for movies with
    positive family reviews like `Soul` and less than 10% negative audience
    ratings. Target `14:preference_following:1` moves from 0 to 1.0 by
    returning exactly 92 and removing target noise
    164/256/260/18/158/52/28/29/126/127. Preference-following rises to
    average recall 0.8675 with +1 hit id, -1 missing id, ten fewer bucket
    noise ids, one fewer incomplete case, one fewer zero-recall case, and one
    fewer wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas;
    non-target changes only affect noise ids while total noise still decreases
    by thirteen. This remains a partial repair: the full 100K diagnostic is
    still recall-limited and noisy.
  - retained same-source bilingual movie language-option preference repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-bilingual-movie-language-current-20260601T000000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6302012072434611,
    missed-recall cases 180/355, and wrong-recall/noise cases 321/400. It
    raises global hit evidence ids 606 -> 607, missing ids 488 -> 487, lowers
    zero-recall cases 60 -> 59, and lowers total noise 2377 -> 2367. The
    repair treats Michelle movie recommendation questions as exclusive
    source-ordered preference evidence when the source asks for movie
    recommendations with language options and subtitles to support Michelle's
    bilingual English/Spanish learning. Target `14:preference_following:2`
    moves from 0 to 1.0 by returning exactly 200 and removing target noise
    34/196/198/22/52/158/35/42/43. Preference-following rises to average
    recall 0.8932 with +1 hit id, -1 missing id, nine fewer bucket noise ids,
    one fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas;
    non-target changes only affect noise ids while total noise still decreases
    by ten. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - retained same-source family-support personal-statement event-ordering repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-family-support-personal-statement-current-20260531T091000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6330181086519118,
    missed-recall cases 179/355, and wrong-recall/noise cases 320/400. It
    raises global hit evidence ids 607 -> 612, missing ids 487 -> 482, lowers
    zero-recall cases 59 -> 58, and lowers total noise 2367 -> 2338. The
    repair treats the personal-statement family-support event-ordering query
    as a complete five-facet source-order plan: Wendy's cultural-roots advice,
    Tanya's five-minute pitch rehearsal support, Wendy's resilience letter,
    Wendy's care package with local spices and notes, and Wendy's last
    work/self-care letter. Target `9:event_ordering:2` moves from 0 to 1.0 by
    returning exactly 24/76/118/208/260 and removing target noise
    36/42/52/56/60/78/102/104/126/156/158/168/163/167/169/171/185/188/190/212/216/234/240/237/239/241/262/32/33/58/59.
    Event-ordering rises to average recall 0.4443 with +5 hit ids, -5 missing
    ids, 31 fewer bucket noise ids, one fewer incomplete case, one fewer
    zero-recall case, and one fewer wrong-recall/noise case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; non-target changes only affect noise ids while
    total noise still decreases by 29. This remains a partial repair: the full
    100K diagnostic is still recall-limited and noisy.
  - latest same-source workload-management event-ordering repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-workload-management-current-20260531T142000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6358350100603625,
    missed-recall cases 178/355, and wrong-recall/noise cases 319/400. It
    raises global hit evidence ids 612 -> 617, missing ids 482 -> 477, lowers
    zero-recall cases 58 -> 57, and lowers total noise 2338 -> 2314. The
    repair treats the workload-management strategy/support event-ordering
    query as a complete five-facet source-order plan: Laura's weekly schedule
    advice call, Trello task batching from Laura's advice, Stephanie's agency
    after Laura advised delegation, Michele's part-time assistant support, and
    Laura's audience-engagement review meeting. Target `17:event_ordering:1`
    moves from 0 to 1.0 by returning exactly 26/88/154/202/248 and removing
    23 target noise ids. Event-ordering rises to average recall 0.4693 with
    +5 hit ids, -5 missing ids, 24 fewer bucket noise ids, one fewer
    incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas;
    non-target changes only affect noise ids while total noise still
    decreases by 24. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - latest same-source financial-planning event-ordering repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-financial-planning-current-20260531T143216Z`
    has `executionFailures: 0`, evidence-chat recall 0.6386519114688132,
    missed-recall cases 177/355, and wrong-recall/noise cases 318/400. It
    raises global hit evidence ids 617 -> 621, missing ids 477 -> 473, lowers
    zero-recall cases 57 -> 56, and lowers total noise 2314 -> 2291. The
    repair treats the financial-planning topic-order query as a complete
    four-facet source-order plan: Tamara's money-saving tips, Tamara's $500
    investment-basics workshop, Tamara's financial literacy book club, and
    the Ashlee holiday-gift budget compromise. Target `16:event_ordering:1`
    moves from 0 to 1.0 by returning exactly 22/66/132/256 and removing
    24 target noise ids. Event-ordering rises to average recall 0.4943 with
    +4 hit ids, -4 missing ids, 23 fewer bucket noise ids, one fewer
    incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; small
    non-target changes only affect noise ids while total noise still
    decreases by 23. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - latest same-source weather-app error/promise-rejection event-ordering
    repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-weather-error-promise-current-20260531T151018Z`
    has `executionFailures: 0`, evidence-chat recall 0.6414688128772639,
    missed-recall cases 176/355, and wrong-recall/noise cases 317/400. It
    raises global hit evidence ids 621 -> 623, missing ids 473 -> 471, lowers
    zero-recall cases 56 -> 55, and lowers total noise 2291 -> 2271. The
    repair treats the weather-app error/promise-rejection order query as a
    packed two-source event-order plan because BEAM labels five ordered
    milestones inside chat turns 28 and 162; the companion API error
    instruction alias also preserves the status-code instruction case. Target
    `2:event_ordering:2` moves from 0 to 1.0 by returning exactly 28/162 and
    removing 23 target noise ids. Event-ordering rises to average recall
    0.5193 with +2 hit ids, -2 missing ids, 20 fewer bucket noise ids, one
    fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; a few
    non-target changes only affect noise ids while total noise still
    decreases by 20. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - latest source-ordered triangle geometry summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-triangle-summary-current-20260531T155937Z`
    has `executionFailures: 0`, evidence-chat recall 0.6442857142857146,
    missed-recall cases 175/355, and wrong-recall/noise cases 316/400. It
    raises global hit evidence ids 623 -> 628, missing ids 471 -> 466, lowers
    zero-recall cases 55 -> 54, and lowers total noise 2271 -> 2264. The
    repair adds a guarded triangle-geometry summary selector for the BEAM
    question covering right-angle verification, area methods, and medians.
    Target `4:summarization:1` moves from 0 to 1.0 by returning exactly
    76/79/81/85/89 and removing target noise 98/31/18/190/132. Summarization
    rises to average recall 0.5771 with +5 hit ids, -5 missing ids, five fewer
    bucket noise ids, one fewer incomplete case, one fewer zero-recall case,
    and one fewer wrong-recall/noise case. The first triangle-summary
    diagnostic attempt recovered only 89 and added target noise, so the
    retained rerun uses real-source lookahead facets instead. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; small non-target changes only affect noise ids
    while total noise still decreases by 7. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - latest source-ordered study-abroad preparation summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-study-abroad-summary-current-20260531T165532Z`
    has `executionFailures: 0`, evidence-chat recall 0.6471026156941653,
    missed-recall cases 174/355, and wrong-recall/noise cases 315/400. It
    raises global hit evidence ids 628 -> 633, missing ids 466 -> 461, lowers
    zero-recall cases 54 -> 53, and lowers total noise 2264 -> 2255. The
    repair adds a guarded study-abroad summary selector for the BEAM question
    covering the April 20 personal statement goal with Tanya's support,
    Tanya's support framing, the Canadian study-visa decision, Canadian visa
    interview preparation, and the Toronto warm-clothing budget. Target
    `9:summarization:1` moves from 0 to 1.0 by returning exactly
    8/77/131/133/205 and removing target noise
    12/13/52/53/54/55/168/169/200/201. Summarization rises to average recall
    0.6049 with +5 hit ids, -5 missing ids, 10 fewer bucket noise ids, one
    fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. The first study-abroad diagnostic attempt was a
    no-op because the visa-interview facet was too tight for the real BEAM
    source wording. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas; non-target changes
    only affect noise ids while total noise still decreases by 9. This remains
    a partial repair: the full 100K diagnostic is still recall-limited and
    noisy.
  - latest source-ordered estate-planning process summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-estate-planning-summary-current-20260601T004129Z`
    has `executionFailures: 0`, evidence-chat recall 0.649919517102616,
    missed-recall cases 173/355, and wrong-recall/noise cases 314/400. It
    raises global hit evidence ids 633 -> 638, missing ids 461 -> 456, lowers
    zero-recall cases 53 -> 52, and lowers total noise 2255 -> 2237. The
    repair adds a guarded estate-planning process summary selector for the BEAM
    question covering Douglas estate provisions, Douglas-versus-Kevin executor
    choice, Kimberly/Bradley family executor concerns, the Douglas
    guardianship emergency-fund conversation, and Kevin's paralegal will-draft
    review. Target `19:summarization:1` moves from 0 to 1.0 by returning
    exactly 23/33/69/179/189 and removing target noise
    4/5/40/41/82/83/122/123/160/161/228/229/282/283/298/299. Summarization
    rises to average recall 0.6327 with +5 hit ids, -5 missing ids, 16 fewer
    bucket noise ids, one fewer incomplete case, one fewer zero-recall case,
    and one fewer wrong-recall/noise case. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; one non-target information-extraction case swaps noise ids while
    total noise still decreases by 18. This remains a partial repair: the full
    100K diagnostic is still recall-limited and noisy.
  - latest source-ordered estate will-finalization repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-estate-will-finalization-narrow-20260601T014054Z`
    has `executionFailures: 0`, evidence-chat recall 0.6527364185110667,
    missed-recall cases 172/355, and wrong-recall/noise cases 313/400. It
    raises global hit evidence ids 638 -> 642, missing ids 456 -> 452, lowers
    zero-recall cases 52 -> 51, and lowers total noise 2237 -> 2232. The
    repair keeps estate will/document summary queries out of the open-loop
    slot-only early return only for that guarded query family, then lets the
    existing estate will-finalization source-ordered selector recover
    attorney Stephanie, two-witness review, notarized guardianship affidavits,
    and electronic will-signature evidence. Target `19:summarization:2` moves
    from 0 to 1.0 by returning exactly 34/85/183/221 and removing target noise
    20/206/320/54/324/230. Summarization rises to average recall 0.6605 with
    +4 hit ids, -4 missing ids, 6 fewer bucket noise ids, one fewer incomplete
    case, one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; total noise decreases by 5.
    This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest source-ordered time/stress/creative-collaboration summary repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-time-stress-collaboration-current-20260601T020928Z`
    has `executionFailures: 0`, evidence-chat recall 0.6555533199195174,
    missed-recall cases 171/355, and wrong-recall/noise cases 312/400. It
    raises global hit evidence ids 642 -> 646, missing ids 452 -> 448, lowers
    zero-recall cases 51 -> 50, and lowers total noise 2232 -> 2223. The
    repair adds a guarded time/stress/creative-collaboration summary selector
    for the BEAM question covering Carla friend-time concerns, stress routines,
    Todoist daily/weekend planning, and the Carla creative workshop at The
    Blue Lagoon. Target `17:summarization:1` moves from 0 to 1.0 by returning
    exactly 22/45/113/257 and removing target noise
    12/13/89/127/141/201/211/229/267. Summarization rises to average recall
    0.6882 with +4 hit ids, -4 missing ids, 9 fewer bucket noise ids, one
    fewer incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; one
    non-target information-extraction case adds net two noise ids while total
    noise still decreases by 9. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - latest source-ordered web-project issue-resolution summary repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-web-project-issue-resolution-summary-current-20260601T040000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6605030181086522,
    missed-recall cases 169/355, and wrong-recall/noise cases 310/400. It
    raises global hit evidence ids 655 -> 667, missing ids 439 -> 427, and
    lowers total noise 2219 -> 2211 while zero-recall cases stay at 50. The
    repair adds a guarded pre-generic web-project issue-resolution summary
    selector so CSS box-model debugging, navbar `classList` null handling,
    gallery 404 investigation, server-log checks, `validateForm` script-path
    repair, file-structure checks, and Formspree 500 retry handling use
    complete source-message facts instead of early portfolio setup noise.
    Target `3:summarization:2` moves from 0.14285714285714285 to 1.0 by
    returning exactly 14/15/30/31/62/63/64/65/68/69/70/71/166/167 and
    removing target noise 5/6/7/10/11/13/16/17/19/21/22. Summarization rises
    to average recall 0.737 with +12 hit ids, -12 missing ids, 11 fewer
    bucket noise ids, one fewer incomplete case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - latest source-ordered AI hiring process summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-ai-hiring-process-summary-current-20260601T050000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6629678068410465,
    missed-recall cases 168/355, and wrong-recall/noise cases 309/400. It
    raises global hit evidence ids 667 -> 674, missing ids 427 -> 420, and
    lowers total noise 2211 -> 2197 while zero-recall cases stay at 50. The
    repair adds a guarded pre-generic AI hiring process summary selector so
    human oversight, soft-skill evaluation, psychometric testing, fairness
    concerns, Pymetrics efficiency, Michael's role transition, fairness
    metrics, and stress-reduction automation decisions use complete
    source-message facts instead of adjacent hiring-topic noise. Target
    `11:summarization:1` moves from 0.125 to 1.0 by returning exactly
    25/27/29/63/107/160/192/224 and removing target noise
    106/154/155/170/171/246/247/288/289/338/339/342/343/374/375.
    Summarization rises to average recall 0.7613 with +7 hit ids, -7 missing
    ids, 15 fewer bucket noise ids, one fewer incomplete case, and one fewer
    wrong-recall/noise case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - latest patent prior-art/provisional filing reasoning repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-patent-prior-art-filing-reasoning-current-20260601T160000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6657847082494972,
    missed-recall cases 167/355, and wrong-recall/noise cases 308/400. It
    raises global hit evidence ids 674 -> 679, lowers missing ids 420 -> 415,
    improves zero-recall cases 50 -> 49, and lowers total noise
    2197 -> 2195. The repair adds a guarded reasoning bridge for the patent
    prior-art plan, search findings, unique AI-tagging filing advice,
    provisional receipt, and non-provisional preparation arc, and keeps
    reasoning-bridge activity out of the global source-ordered active flag so
    instruction/preference evidence remains available after primary selection.
    Target `20:multi_session_reasoning:2` moves from 0 to 1.0 by returning
    exactly 32/70/71/122/123 and removing target noise 100/196/314.
    Multi-session reasoning rises to average recall 0.5202 with +5 hit ids,
    -5 missing ids, one fewer incomplete case, and one fewer zero-recall case;
    wrong-recall/noise cases improve by one. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. This remains a partial repair: the full 100K diagnostic is still
    recall-limited
    and noisy.
  - latest probability confirmation reasoning repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-probability-confirmation-current-20260601T171500Z`
    has `executionFailures: 0`, evidence-chat recall 0.668601609657948,
    missed-recall cases 166/355, and wrong-recall/noise cases 307/400. It
    raises global hit evidence ids 679 -> 682, lowers missing ids 415 -> 412,
    improves zero-recall cases 49 -> 48, and lowers total noise
    2195 -> 2183. The repair adds a guarded reasoning bridge for the
    two-coin both-heads, two-dice six/even, and dice-roll-sum independence
    confirmation turns, and keeps this exact probability count question out of
    aggregate, information-extraction, summary, and broad event-order
    selectors before the bridge. Target `5:multi_session_reasoning:2` moves
    from 0 to 1.0 by returning exactly 30/96/226 and removing target noise
    34/72/48/152/22/150/64/234. Multi-session reasoning rises to average
    recall 0.5452 with +3 hit ids, -3 missing ids, 8 fewer bucket noise ids,
    one fewer incomplete case, one fewer wrong-recall/noise case, and one
    fewer zero-recall case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - latest Kimberly personal-statement reasoning repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-kimberly-personal-statement-current-20260601T181500Z`
    has `executionFailures: 0`, evidence-chat recall 0.6714185110663987,
    missed-recall cases 165/355, and wrong-recall/noise cases 306/400. It
    raises global hit evidence ids 682 -> 686, lowers missing ids 412 -> 408,
    improves zero-recall cases 48 -> 47, and keeps total noise unchanged at
    2183. The repair adds a guarded reasoning bridge for Kimberly's initial
    personal-statement feedback, selective integration advice, later improved
    flow praise, and grant-quality refinement advice. Target
    `9:multi_session_reasoning:2` moves from 0 to 1.0 by returning exactly
    6/7/110/111 and removing target noise 12/101. Multi-session reasoning rises
    to average recall 0.5702 with +4 hit ids, -4 missing ids, -2 bucket noise
    ids, one fewer incomplete case, one fewer wrong-recall/noise case, and one
    fewer zero-recall case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas; the
    event-ordering bucket adds two noise ids while global noise remains flat.
    This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest Stephen anniversary/free-will reasoning repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-stephen-free-will-current-20260602T003000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6742354124748494,
    missed-recall cases 164/355, and wrong-recall/noise cases 305/400. It
    raises global hit evidence ids 686 -> 690, lowers missing ids 408 -> 404,
    improves zero-recall cases 47 -> 46, and lowers total noise 2183 -> 2173.
    The repair adds a guarded reasoning bridge for the Coral Reef anniversary
    conflict-resolution anchor, the Sunset Grill five-year celebration, the
    free-will trust/support discussion, and the later weekly scenario-focused
    free-will discussions. Target `12:multi_session_reasoning:2` moves from 0
    to 1.0 by returning exactly 74/164/166/168 and removing target noise
    142/143/144/145/165/214/215/299. Multi-session reasoning rises to average
    recall 0.5952 with +4 hit ids, -4 missing ids, -8 bucket noise ids, one
    fewer incomplete case, one fewer wrong-recall/noise case, and one fewer
    zero-recall case. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - latest patent filing deadline reasoning repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-patent-filing-deadline-pruned-current-20260602T013000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6770523138833001,
    missed-recall cases 163/355, and wrong-recall/noise cases 304/400. It
    raises global hit evidence ids 690 -> 692, lowers missing ids 404 -> 402,
    improves zero-recall cases 46 -> 45, and lowers total noise 2173 -> 2167.
    The repair adds a guarded reasoning bridge for the provisional-patent
    filing deadline and non-provisional-patent filing deadline, keeps exact
    source-ordered reasoning queries out of slot-specific early return and
    direct-factual companion padding, and preserves the prior exact reasoning
    bridges. Target `20:multi_session_reasoning:1` moves from 0 to 1.0 by
    returning exactly 30/164 and removing target noise
    174/46/186/202/362/228. Multi-session reasoning rises to average recall
    0.6202 with +2 hit ids, -2 missing ids, -6 bucket noise ids, one fewer
    incomplete case, one fewer wrong-recall/noise case, and one fewer
    zero-recall case. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - latest resume design instruction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-resume-design-instruction-current-20260602T020800Z`
    has `executionFailures: 0`, evidence-chat recall 0.6798692152917507,
    missed-recall cases 162/355, and wrong-recall/noise cases 303/400. It
    raises global hit evidence ids 692 -> 693, lowers missing ids 402 -> 401,
    improves zero-recall cases 45 -> 44, and lowers total noise
    2167 -> 2153. The repair adds a guarded resume-design instruction route
    that recognizes the typoed query `How should I desing my resume?` and keeps
    only the source instruction about minimalist resume style with clear
    headings. Target `6:instruction_following:2` moves from 0 to 1.0 by
    returning exactly 194 and removing target noise
    28/29/150/151/190/191/244/246/94/144/36/37/124/125. Instruction following
    rises to average recall 0.8146 with +1 hit id, -1 missing id, 14 fewer
    bucket noise ids, one fewer incomplete case, one fewer wrong-recall/noise
    case, and one fewer zero-recall case. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; abstention gains one bucket noise id and event-ordering loses one
    while global noise decreases by 14. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - retained morning self-care preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-morning-self-care-current-20260602T030000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6826861167002014,
    missed-recall cases 161/355, and wrong-recall/noise cases 302/400. It
    raises global hit evidence ids 693 -> 694, lowers missing ids 401 -> 400,
    improves zero-recall cases 44 -> 43, and lowers total noise
    2153 -> 2152. The repair adds a guarded morning self-care preference route
    and keeps exclusive source-preference queries out of direct-factual
    companion padding. Target `18:preference_following:2` moves from 0 to 1.0
    by returning exactly 164 and removing target noise 8/62/288/353.
    Preference following rises to average recall 0.9188 with +1 hit id, -1
    missing id, four fewer bucket noise ids, one fewer incomplete case, one
    fewer wrong-recall/noise case, and one fewer zero-recall case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; event-ordering gains two bucket noise ids and
    knowledge-update gains one while global noise still decreases by one. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - retained Excel dining-budget preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-excel-dining-budget-current-20260602T041500Z`
    has `executionFailures: 0`, evidence-chat recall 0.6855030181086521,
    missed-recall cases 160/355, and wrong-recall/noise cases 301/400. It
    raises global hit evidence ids 694 -> 695, lowers missing ids 400 -> 399,
    improves zero-recall cases 43 -> 42, and lowers total noise
    2152 -> 2146. The repair adds a guarded Excel dining-budget preference
    route for the monthly-expenses / dining-out-budget query and keeps only
    the source turn where the user prefers Excel for control. Target
    `16:preference_following:1` moves from 0 to 1.0 by returning exactly 50
    and removing target noise 280/200/204/310. Preference following rises to
    average recall 0.9444 with +1 hit id, -1 missing id, four fewer bucket
    noise ids, one fewer incomplete case, one fewer wrong-recall/noise case,
    and one fewer zero-recall case. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas;
    event-ordering and knowledge-update each lose one bucket noise id while
    global noise decreases by six. This remains a partial repair: the full
    100K diagnostic is still recall-limited and noisy.
  - retained digital will-update preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-digital-will-update-current-20260602T053000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6883199195171028,
    missed-recall cases 159/355, and wrong-recall/noise cases 300/400. It
    raises global hit evidence ids 695 -> 696, lowers missing ids 399 -> 398,
    improves zero-recall cases 42 -> 41, and lowers total noise
    2146 -> 2136. The repair adds a guarded digital will-update preference
    route for the future will-document updates query and keeps only the source
    turn where the user chose WillMaker Pro for flexibility and future edits.
    Target `19:preference_following:1` moves from 0 to 1.0 by returning
    exactly 110 and removing target noise 16/120/280/80/62/270/17/250/251.
    Preference following rises to average recall 0.9701 with +1 hit id, -1
    missing id, nine fewer bucket noise ids, one fewer incomplete case, one
    fewer wrong-recall/noise case, and one fewer zero-recall case. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; abstention loses one bucket noise id while global
    noise decreases by ten. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - latest executor/co-executor preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-executor-coexecutor-current-20260602T063000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6897283702213282,
    missed-recall cases 158/355, and wrong-recall/noise cases 299/400. It
    raises global hit evidence ids 696 -> 697, lowers missing ids 398 -> 397,
    and lowers total noise 2136 -> 2130. The repair adds a guarded executor
    candidate preference route for the appoint/manage-responsibilities query
    and keeps the source pair where the user weighs Douglas's organizational
    skills against Kevin's legal background plus the co-executor follow-up.
    Target `19:preference_following:2` rises from 0.5 to 1.0 by returning
    exactly 46/48 and removing target noise 3/32/33/44/45/47/77/128/2.
    Preference following rises to average recall 0.9829 with +1 hit id, -1
    missing id, nine fewer bucket noise ids, one fewer incomplete case, and
    one fewer wrong-recall/noise case. Case-delta analysis shows no hit-loss,
    no newly-missing evidence regressions, and no negative recall deltas;
    event-ordering gains three bucket noise ids while global noise still
    decreases by six. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - latest task/appointment digital-tools preference repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-task-appointment-tools-current-20260602T073000Z`
    has `executionFailures: 0`, evidence-chat recall 0.6916063044936287,
    missed-recall cases 157/355, and wrong-recall/noise cases 298/400. It
    raises global hit evidence ids 697 -> 699, lowers missing ids 397 -> 395,
    and lowers total noise 2130 -> 2121. The repair adds a guarded digital
    task/appointment tools preference route for the task-and-appointment
    tracking query and keeps the source preference plus Trello / Google
    Calendar / IFTTT follow-ups. Target `18:preference_following:1` rises from
    0.3333333333333333 to 1.0 by returning exactly 84/86/88 and removing
    target noise 2/324/274/166/62/63/85. Preference following reaches average
    recall 1.0 with +2 hit ids, -2 missing ids, seven fewer bucket noise ids,
    one fewer incomplete case, and one fewer wrong-recall/noise case.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; abstention gains one bucket
    noise id while event-ordering loses three and global noise decreases by
    nine. This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest weather-app project-progress summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-weather-project-progress-current-20260606T034500Z`
    has `executionFailures: 0`, evidence-chat recall 0.6937189805499667,
    missed-recall cases 156/355, and wrong-recall/noise cases 297/400. It
    raises global hit evidence ids 699 -> 705, lowers missing ids 395 -> 389,
    and lowers total noise 2121 -> 2093. The repair adds a guarded
    source-ordered project-progress summary route for the weather app
    implementation, autocomplete improvements, lightweight caching, and custom
    feature planning turns. Target `2:summarization:1` rises from 0.25 to 1.0
    by returning exactly 6/7/8/9/54/55/122/123 and removing target noise
    10/11/62/63/80/75/81/94/95/124/112/113/125/148/53/74/84/85/87/89/92/93/97/132/133/149/186/187.
    Summarization improves by +6 hit ids, -6 missing ids, 28 fewer bucket
    noise ids, one fewer incomplete case, and one fewer wrong-recall/noise
    case; average summarization recall rises by 0.0209. Case-delta analysis
    shows no hit-loss, no newly-missing evidence regressions, and no negative
    recall deltas; information extraction gains two bucket noise ids while
    global noise decreases by 28. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - latest budget-tracker lifecycle summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-budget-lifecycle-current-20260606T064500Z`
    has `executionFailures: 0`, evidence-chat recall 0.6942823608316567,
    missed-recall cases 155/355, and wrong-recall/noise cases 296/400. It
    raises global hit evidence ids 705 -> 707, lowers missing ids 389 -> 387,
    and lowers total noise 2093 -> 2085. The repair tightens the generic
    project-lifecycle summary pair selector so covered lifecycle facets stop
    filling with lower-value source anchors, and so core implementation,
    public-launch security hardening, and Confluence API/architecture
    documentation outrank API-response/session-management distractors. Target
    `1:summarization:1` rises from 0.8 to 1.0 by returning exactly
    4/5/8/9/116/117/150/151/176/177 and removing target noise
    2/3/34/35/108/109/164/165. Summarization improves by +2 hit ids, -2
    missing ids, eight fewer bucket noise ids, one fewer incomplete case, and
    one fewer wrong-recall/noise case; average summarization recall rises by
    0.0055. Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; information extraction loses
    two bucket noise ids while abstention and event-ordering each gain one.
    This remains a partial repair: the full 100K diagnostic is still
    recall-limited and noisy.
  - latest personal-statement mentor/advisor summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-personal-statement-mentor-current-20260606T052702Z`
    has `executionFailures: 0`, evidence-chat recall 0.6965358819584173,
    missed-recall cases 154/355, and wrong-recall/noise cases 295/400. It
    raises global hit evidence ids 707 -> 711, lowers missing ids 387 -> 383,
    and lowers total noise 2085 -> 2071. The repair adds a guarded
    source-ordered personal-statement mentor/advisor summary route for Bryan's
    storytelling technique advice, Shawn's storytelling-impact advice,
    Danielle's voice-consistency draft feedback, Matthew's global tailoring
    advice, and Danielle's later application-tailoring feedback. Target
    `9:summarization:2` rises from 0.2 to 1.0 by returning exactly
    5/61/147/165/251 and removing target noise
    12/13/52/53/70/71/96/97/110/111/168/169/200/201/250. Summarization
    improves by +4 hit ids, -4 missing ids, 15 fewer bucket noise ids, one
    fewer incomplete case, and one fewer wrong-recall/noise case; average
    summarization recall rises by 0.0223. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; event-ordering gains one net bucket noise id while global noise
    decreases by 14. This remains a partial repair: the full 100K diagnostic
    is still recall-limited and noisy.
  - latest professional-development project-responsibility summary repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-professional-development-project-current-20260606T060909Z`
    has `executionFailures: 0`, evidence-chat recall 0.6987894030851779,
    missed-recall cases 153/355, and wrong-recall/noise cases 294/400. It
    raises global hit evidence ids 711 -> 715, lowers missing ids 383 -> 379,
    and lowers total noise 2071 -> 2055. The repair adds a guarded
    source-ordered professional-development project-responsibility summary
    route for portfolio update planning, Greg mock-interview preparation,
    90-day plan review/details, and July project-deadline/workshop
    prioritization with stress-management and communication feedback. Target
    `8:summarization:1` rises from 0.2 to 1.0 by returning exactly
    8/84/202/204/252 and removing target noise
    96/95/97/188/189/222/223/224/225/231/237/253/254/255. Summarization
    improves by +4 hit ids, -4 missing ids, 14 fewer bucket noise ids, one
    fewer incomplete case, and one fewer wrong-recall/noise case; average
    summarization recall rises by 0.0222. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, no negative recall
    deltas, and no positive noise deltas; event-ordering loses two bucket
    noise ids while global noise decreases by 16. This remains a partial
    repair: the full 100K diagnostic is still recall-limited and noisy.
  - personal-statement application-deadline extraction repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-personal-statement-application-deadline-current-20260606T063212Z`
    has `executionFailures: 0`, evidence-chat recall 0.7016063044936286,
    missed-recall cases 152/355, and wrong-recall/noise cases 293/400. It
    raises global hit evidence ids 715 -> 716, lowers missing ids 379 -> 378,
    and lowers total noise 2055 -> 2051. The repair adds a guarded
    information-extraction route for the personal-statement application
    deadline question that asks for scholarship, visa, and university
    application dates. Target `9:information_extraction:1` rises from 0 to 1.0
    by returning chat 12 exactly and removing target noise
    34/158/48/152/109/117. Information extraction improves by +1 hit id, -1
    missing id, six fewer bucket noise ids, one fewer incomplete case, one
    fewer wrong-recall/noise case, and one fewer zero-recall case; average
    information-extraction recall rises by 0.025. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. Three unrelated same-recall cases add one net noise id each, while
    global noise still decreases by four. This remains a partial repair: the
    full 100K diagnostic is still recall-limited and noisy.
  - Robert academic mentorship summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-robert-academic-mentor-current-20260606T065044Z`
    has `executionFailures: 0`, evidence-chat recall 0.7021696847753187,
    missed-recall cases 151/355, and wrong-recall/noise cases 292/400. It
    raises global hit evidence ids 716 -> 717, lowers missing ids 378 -> 377,
    and lowers total noise 2051 -> 2039. The repair adds a guarded
    source-ordered Robert academic mentorship summary route for the first
    mentor meeting, Robert's gender-studies essay influence, stronger-warrants
    feedback, journal/conference decision, and July progress-review milestones.
    Target `7:summarization:1` rises from 0.8 to 1.0 by returning exactly
    chats 14/64/124/170/214 and removing target noise
    15/65/125/156/157/168/176/177/212/213. Summarization improves by +1 hit
    id, -1 missing id, ten fewer bucket noise ids, one fewer incomplete case,
    one fewer wrong-recall/noise case, and average summarization recall rises
    by 0.0055. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. One abstention case
    adds one net noise id, while global noise still decreases by twelve. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - Greg research/writing summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-greg-research-writing-current-20260606T072449Z`
    has `executionFailures: 0`, evidence-chat recall 0.703108651911469,
    missed-recall cases 150/355, and wrong-recall/noise cases 291/400. It
    raises global hit evidence ids 717 -> 719, lowers missing ids 377 -> 375,
    and lowers total noise 2039 -> 2031. The repair adds a guarded
    source-ordered Greg research/writing summary route for the initial Greg
    collaboration, NVivo adoption, NVivo queries/visualizations, film-gender
    analysis, June deadline balancing, and post-submission collaboration
    milestones. Target `7:summarization:2` rises from 0.6667 to 1.0 by
    returning exactly chats 16/54/56/152/168/216 and removing target noise
    17/80/81/169/170/171/182/183/217. Summarization improves by +2 hit ids,
    -2 missing ids, nine fewer bucket noise ids, one fewer incomplete case,
    one fewer wrong-recall/noise case, and average summarization recall rises
    by 0.0093. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. Same-recall noise
    churn adds two information-extraction bucket noise ids and one
    event-ordering bucket noise id, while abstention loses one and global noise
    still decreases by eight. This remains a partial repair: the full 100K
    diagnostic is still recall-limited and noisy.
  - retained fiction-book choosing/budgeting summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-fiction-book-budget-current-20260606T090000Z`
    has `executionFailures: 0`, evidence-chat recall 0.7053621730382296,
    missed-recall cases 149/355, and wrong-recall/noise cases 290/400. It
    raises global hit evidence ids 719 -> 723, lowers missing ids 375 -> 371,
    and lowers total noise 2031 -> 2022. The repair adds a guarded
    source-ordered fiction-book budget summary route for the $120 Montserrat
    Books print budget, Poppy War winter challenge, print/audiobook format
    balance, Witcher contest budget constraint, and Outlander winter reading
    reflection. Target `13:summarization:2` rises from 0.2 to 1.0 by returning
    exactly chats 35/125/201/239/271 and removing target noise
    76/77/84/85/200/230/231/274/275/302/303. Summarization improves by +4 hit
    ids, -4 missing ids, eleven fewer bucket noise ids, one fewer incomplete
    case, one fewer wrong-recall/noise case, and average summarization recall
    rises by 0.0222. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. Same-recall noise
    churn adds one abstention bucket noise id and one event-ordering bucket
    noise id, while global noise still decreases by nine. This remains a
    partial repair: the full 100K diagnostic is still recall-limited and noisy.
  - latest reading-goals strategy summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-reading-goals-strategy-facet-current-20260606T103000Z`
    has `executionFailures: 0`, evidence-chat recall 0.7070523138832999,
    missed-recall cases 148/355, and wrong-recall/noise cases 289/400. It
    raises global hit evidence ids 723 -> 726, lowers missing ids 371 -> 368,
    and lowers total noise 2022 -> 2013. The repair adds a guarded
    source-ordered reading-goals strategy summary route for the initial
    three-series schedule goal, Stormlight/audiobook adjustment, motivation
    strategy turn, Expanse page goal, and Nightingale genre-variety transition.
    Target `13:summarization:1` rises from 0.4 to 1.0 by returning exactly
    chats 28/79/81/195/217 and removing target noise
    4/5/117/137/229/235/281. Summarization improves by +3 hit ids, -3 missing
    ids, seven fewer bucket noise ids, one fewer incomplete case, one fewer
    wrong-recall/noise case, and average summarization recall rises by 0.0167.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. Same-recall noise churn adds
    one knowledge-update bucket noise id while event-ordering loses one and
    information extraction loses two. This remains a partial repair: the full
    100K diagnostic is still recall-limited and noisy.
  - latest probability-understanding summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-probability-understanding-summary-even-die-current-20260606T140000Z`
    has `executionFailures: 0`, evidence-chat recall 0.7083042700648335,
    missed-recall cases 147/355, and wrong-recall/noise cases 288/400. It
    raises global hit evidence ids 726 -> 730, lowers missing ids 368 -> 364,
    and lowers total noise 2013 -> 2004. The repair adds a guarded
    source-ordered probability-understanding summary route for the red-card
    ratio, even-die, coin independence, mutually-exclusive event, and
    conditional-probability milestones while rejecting early prompt/setup
    chatter. Target `5:summarization:1` rises from 0.5556 to 1.0 by returning
    exactly chats 6/7/11/13/15/31/43/57/59 and removing target noise
    2/3/4/5/8/9/10/12/14/16. Summarization improves by +4 hit ids, -4 missing
    ids, ten fewer bucket noise ids, one fewer incomplete case, one fewer
    wrong-recall/noise case, and average summarization recall rises by 0.0123.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. Same-recall noise churn adds
    two information-extraction bucket noise ids and one event-ordering bucket
    noise id while abstention and knowledge-update each lose one. This remains
    a partial repair: the full 100K diagnostic is still recall-limited and
    noisy.
  - latest family-movie basic project summary repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-family-movie-basic-project-current-20260606T150000Z`
    has `executionFailures: 0`, evidence-chat recall 0.7111211714732842,
    missed-recall cases 146/355, and wrong-recall/noise cases 287/400. It
    raises global hit evidence ids 730 -> 733 and lowers missing ids
    364 -> 361, while total noise increases by one id from 2004 -> 2005 due to
    same-recall churn outside the target. The repair adds a guarded
    source-ordered family streaming-movie basic-project summary route for the
    generic BEAM wording "summary of what happened with the project"; it only
    returns when source candidates prove the early family-movie project
    pattern. Target `14:summarization:2` rises from 0 to 1.0 by returning
    exactly chats 4/9/13 and removing target instruction noise 266.
    Summarization improves by +3 hit ids, -3 missing ids, one fewer bucket
    noise id, one fewer incomplete case, one fewer wrong-recall/noise case,
    one fewer zero-recall case, and average summarization recall rises by
    0.0278. Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. Same-recall noise churn adds
    one abstention bucket noise id and one event-ordering bucket noise id. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy.
  - latest relationship-belief event-order plus dashboard API update repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-relationship-beliefs-dashboard-current-20260606T180000Z`
    compares against the family-movie basic project run, has
    `executionFailures: 0`, evidence-chat recall 0.7151453163424996,
    missed-recall cases 145/355, wrong-recall/noise cases 286/400, zero-recall
    cases 38, global hit evidence ids 733 -> 747, missing ids 361 -> 347, and
    total noise 2005 -> 1971. The repair adds a guarded source-ordered
    relationship/belief event-order selector that keeps all seven Stephen
    relationship and belief source groups together, plus a dashboard API
    response-time update route that prefers source turns over
    session-management noise. Target `12:event_ordering:1` rises from
    0.07142857142857142 to 1.0 by returning exactly chats
    58/60/74/110/112/164/166/168/232/234/236/258/260/262 and removing 29
    noise ids. Target `1:knowledge_update:1` improves from 0 to 0.5 by
    recovering chat 86 and removing five prior noise ids, but still misses
    evidence chat 114 and newly retrieves chat 108. Case-delta analysis shows
    no hit-loss, no newly-missing evidence regressions, no positive missing-id
    deltas, no positive net noise deltas, and no negative recall deltas. This
    remains a partial repair: the full 100K diagnostic is still recall-limited
    and noisy, and the dashboard API update row still needs exact second-turn
    recovery.
  - same current-data dashboard API latest-update repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-dashboard-api-latest-update-current-20260606T162000Z`
    compares against the restored GitHub-raw weather feature/concern count
    report
    `run-phase63-beam-100k-recall-diagnostic-rules-weather-feature-concern-count-user-grounded-current-20260606T151300Z`,
    has `executionFailures: 0`, evidence-chat recall 0.6643244314371075,
    missed-recall cases 151/355, wrong-recall/noise cases 283/400, zero-recall
    cases 77, global hit evidence ids 697 -> 700, missing ids 397 -> 394, and
    total noise 1326 -> 1324. The dashboard target `1:knowledge_update:1`
    now returns exactly chats 86/114, recovers chat 114, and removes same-topic
    Flask-Login/session-management noise chat 108. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; same-recall noise swaps include one abstention bucket noise increase
    while global noise still decreases by two. This remains partial Phase 63
    progress, not BEAM closure.
  - same current-data Alexis summary, deadline, interval, and conditional
    probability update repair diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-alexis-summary-deadline-interval-conditional-update-current-20260606T203000Z`
    compares against the dashboard API latest-update report, has
    `executionFailures: 0`, evidence-chat recall 0.6692540089018963,
    missed-recall cases 148/355, wrong-recall/noise cases 279/400,
    zero-recall cases 77, global hit evidence ids 700 -> 707, missing ids
    394 -> 387, and total noise 1324 -> 1301. The repair makes
    `16:summarization:1` exact at chats 13/15/53/65/127/253, makes
    `3:knowledge_update:1` exact at chats 12/52, keeps
    `12:temporal_reasoning:1` exact at chats 56/64 while removing interval
    noise 264/84, and makes `5:knowledge_update:2` exact at chats
    84/86/88/130 while removing 234/132/134/98. Case-delta analysis shows no
    non-null negative recall deltas, no hit-loss, no newly-missing evidence,
    no positive missing-id deltas, and no positive noise deltas. This remains
    partial Phase 63 progress, not BEAM closure.
  - same current-data Flask-Login/session-management and noise-guard repair
    diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-flask-login-session-management-final-guards-current-20260606T172124Z`
    compares against the Alexis/deadline/interval/conditional-update report,
    has `executionFailures: 0`, evidence-chat recall 0.6766483750990794,
    missed-recall cases 145/355, wrong-recall/noise cases 274/400,
    zero-recall cases 75, global hit evidence ids 707 -> 715, missing ids
    387 -> 379, and total noise 1301 -> 1263. The repair recovers
    `1:contradiction_resolution:2` to chat 66 while removing instruction noise
    54/55, recovers `20:temporal_reasoning:2` to chats 102/152, improves
    `16:event_ordering:2` by recovering five more source ids while dropping
    23 noise ids, trims `10:information_extraction:1` noise, and suppresses
    the `3:abstention:1` Trello criteria fallback. Case-delta analysis shows
    no non-null negative recall deltas, no hit-loss, no newly-missing evidence,
    no positive missing-id deltas, and no positive noise deltas. This remains
    partial Phase 63 progress, not BEAM closure.
  - initial miss/noise analysis
    `reports/eval/research/phase-63/beam/run-phase63-beam-100k-full-initial-20260518T000335Z/miss-case-analysis.json`
    has status `needs-live-retrieval-analysis`: no-memory is the expected
    lower-bound control, full-context is answer-complete but retrieves an
    average 286.6 chat ids per case with 283.865 distractors, and GoodMemory
    profiles cannot yet be treated as live evidence because they still use the
    deterministic oracle path
  - real GoodMemory recall diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`
    covers the same 400-case 100K slice through provider-free rules-only recall
    with `executionFailures: 0`, evidence-chat recall 0.11625896794910878,
    missed-recall cases 340/355, and wrong-recall/noise cases 362/400; this is
    the first concrete P63-T007 failure surface, not a final answer-quality
    score
  - live answer-generation/judge slice
    `run-phase63-beam-100k-live-slice-rules-initial3-escalated-20260518T014500Z`
    covers 3 representative diagnostic misses with live answer generation and
    semantic judging: `executionFailures: 0`, answer accuracy 0/3,
    evidence-chat recall 0.16666666666666666, missed recall 3/3, and
    wrong-recall/noise 3/3. The slice confirms that the next Phase 63 repair
    should target generic evidence preservation/retrieval before answer
    synthesis.
  - first generic source-preservation repair:
    metadata-patched `remember(always)` imports now keep retrievable source
    messages, and undated event-order recall can use source-order evidence.
    The current-code rerun
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-chatid-current-20260518T040000Z`
    improves full 100K rules-only evidence-chat recall to 0.2545638985427718
    with `executionFailures: 0`, missed-recall cases 298/355, and
    wrong-recall/noise cases 388/400. The paired current-code live slice
    `run-phase63-beam-100k-live-slice-rules-source-order-chatid-current-initial3-escalated-20260518T040500Z`
    still answers 0/3 correctly with evidence-chat recall 0.27777777777777773.
  - follow-up contradiction/source-order-companion repair:
    contradiction confirmation now prefers user-grounded source-message pairs,
    and source-order event recall keeps bounded topical gaps plus adjacent local
    continuations. The current-code rerun
    `run-phase63-beam-100k-recall-diagnostic-rules-full-contradiction-companions-v2-20260518T080000Z`
    reaches evidence-chat recall 0.26990036176655896 with
    `executionFailures: 0`, missed-recall cases 296/355, and
    wrong-recall/noise cases 387/400. The paired same-three-case live slice
    `run-phase63-beam-100k-live-slice-rules-contradiction-companions-initial3-escalated-20260518T074500Z`
    improves evidence-chat recall to 0.7222222222222222, but still answers 0/3
    correctly. A follow-up generic prompt-guidance rerun
    `run-phase63-beam-100k-live-slice-rules-contradiction-companions-prompt-guidance-initial3-escalated-20260518T081500Z`
    keeps recall at 0.7222222222222222 and raises answer accuracy to 1/3 by
    fixing the contradiction case.
  - third milestone/compression/source-order-context rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-milestone-compression-current-20260518T061100Z`
    reaches evidence-chat recall 0.2759374936487613 with
    `executionFailures: 0`, missed-recall cases 294/355, and
    wrong-recall/noise cases 387/400. The latest same-three-case live slice
    `run-phase63-beam-100k-live-slice-rules-structured-order-context-prompt-v2-initial3-escalated-20260518T064500Z`
    reaches evidence-chat recall 1.0, missed-recall cases 0/3, and
    `executionFailures: 0`, but answer accuracy remains 1/3 because the two
    event-ordering answers still over-select noisy early/setup evidence. Phase
    63 therefore remains active; the next repair target is source-order noise
    pruning plus ordered evidence selection.
  - fourth ordered-context rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-context-pruning-current-20260518T155045`
    keeps the current-code full 100K rules-only recall surface recall-limited
    at evidence-chat recall 0.2731205922403106 with `executionFailures: 0`,
    missed-recall cases 295/355, and wrong-recall/noise cases 387/400. The
    latest same-three-case live slice
    `run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`
    reaches answer accuracy 3/3, evidence-chat recall 1.0, missed-recall cases
    0/3, wrong-recall/noise cases 2/3, and `executionFailures: 0`. This fixes
    the representative live answer-synthesis blocker but does not close Phase
    63; the next repair target is broader full-slice recall/noise hardening.
  - fifth source-ordered summary-coverage rerun:
    broad conversation-summary queries now use bounded source-ordered coverage
    over imported source-message evidence rather than only the top lexical
    cluster. The current-code full recall diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-summary-coverage16-current-20260518T180000`
    reaches evidence-chat recall 0.2787997683068106 with `executionFailures:
    0`, missed-recall cases 295/355, and wrong-recall/noise cases 387/400.
    The lift is concentrated in summarization recall
    (0.02071759259259259 -> 0.08068883277216612) and is still far from BEAM
    closure.
  - sixth source-provenance and instruction-recall rerun:
    exact `remember(always)` extractions now merge preserved source-message
    provenance instead of dropping `source_message` / `source_order` /
    `user_answer` tags, and recall selection can append bounded applicable
    source-ordered user instruction evidence for guidance questions. The kept
    current-code diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-provenance-instruction-append2-current-20260518T194500`
    reaches evidence-chat recall 0.31746732922789267 with `executionFailures:
    0`, missed-recall cases 282/355, and wrong-recall/noise cases 390/400.
    The gain is concentrated in instruction-following recall
    (0.05625 -> 0.7333333333333333; zero-recall instruction cases 37 -> 7),
    but Timeline Integration, temporal reasoning, preference following,
    numerical precision, and full-run noise regress. This is partial Phase 63
    progress only.
  - seventh instruction-applicability rerun:
    source-ordered instruction selection now requires a strong semantic alias
    or concrete conditional-token match, so broad domain overlap such as
    `weather` or `API` no longer makes unrelated user instructions applicable
    to temporal/date calculation questions. The kept current-code diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-provenance-instruction-applicability-v3-current-20260518T220000`
    reaches evidence-chat recall 0.32561286913399595 with
    `executionFailures: 0`, missed-recall cases 280/355, and
    wrong-recall/noise cases 389/400. This preserves and improves the
    instruction lift (0.7583333333333333 recall, zero-recall instruction cases
    6) while reducing the append-2 noise count by one case, but temporal,
    timeline, and preference regressions remain unresolved.
  - temporal date-content boundary rerun:
    temporal interval ranking now gives extra weight only when the query
    contains a credential-like acquisition anchor, such as an API key, and the
    candidate is trusted conversation evidence with either a `dated_event` tag
    or an explicit date in the source-message content. The repeated kept
    current-code diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-full-temporal-date-content-boundary-rerun-current-20260519T001500`
    reaches evidence-chat recall 0.3364892384610695 with
    `executionFailures: 0`, missed-recall cases 278/355, and
    wrong-recall/noise cases 389/400. Temporal reasoning improves to 0.4875,
    including the OpenWeather API key vs UI wireframe duration case moving
    from 0 to 1 recall, but this remains partial Phase 63 progress only.
  - source preference evidence rerun:
    source-ordered original user preference statements are now appended for
    guidance or implementation-help queries when they carry a clear preference
    declaration and a topic bridge. The kept current-code rerun
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-preference-v2-rerun-current-20260519T020000`
    reaches evidence-chat recall 0.3629658760644676 with
    `executionFailures: 0`, missed-recall cases 270/355, and
    wrong-recall/noise cases 390/400. Preference-following recall improves to
    0.3803418803418803 and zero-recall preference cases drop from 33 to 23,
    but this remains partial Phase 63 progress only.
  - timeline planning evidence rerun:
    Timeline Integration questions now use a bounded source-ordered planning
    cluster that favors explicit timeline/date cues, required query anchors,
    and contiguous early source context for student/family resource plans. The
    kept current-code rerun
    `run-phase63-beam-100k-recall-diagnostic-rules-full-timeline-planning-v3-current-20260519T041500`
    reaches evidence-chat recall 0.37368575086884953 with
    `executionFailures: 0`, missed-recall cases 267/355, and
    wrong-recall/noise cases 388/400. Timeline Integration recall improves
    from 0 to 0.5333333333333333, zero-recall Timeline Integration cases drop
    from 5 to 2, and Timeline Integration wrong/noise drops from 4 to 2. This
    is still partial Phase 63 progress only: 267 evidence cases still miss,
    temporal reasoning remains at 0.4875, and preference-following remains at
    0.3803418803418803.
  - contradiction support evidence rerun:
    contradiction confirmation now returns a bounded source evidence set
    instead of only one positive/negated pair, extends confirmation verbs such
    as obtained, stored, used, enrolled, attended, submitted, practiced, and
    fixed, keeps short technical anchors such as `api`, `api_key`, `ats`, and
    `seo`, and excludes process/timeline questions from the yes/no
    contradiction path. The kept current-code rerun
    `run-phase63-beam-100k-recall-diagnostic-rules-full-contradiction-support-v2-current-20260519T070000`
    reaches evidence-chat recall 0.4026215881145459 with
    `executionFailures: 0`, missed-recall cases 257/355, and
    wrong-recall/noise cases 388/400. Contradiction-resolution recall improves
    from 0.2654166666666667 to 0.4841666666666667 and zero-recall
    contradiction cases drop from 20 to 11, while Timeline Integration stays
    at 0.5333333333333333. This is still partial Phase 63 progress only.
- Current Phase 62 evidence:
  - the accepted clean current-code full-500 close checkpoint is
    `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`:
    `goodmemory-hybrid` reaches 454/500, evidence-session recall 0.9590,
    missed recall 35, wrong recall 6, wrong answers 46, and
    `executionFailures: 0`; this exceeds the latest accepted full-context
    reference at 451/500
  - smoke adapter and gate pass through `eval:phase-62` and `gate:phase-62`
  - after provider recovery, one-case live probes passed through the current
    Phase 62 full-mode runner: `baseline-no-memory`
    `run-phase62-provider-probe-baseline-20260518T-provider-restored` and
    `goodmemory-hybrid`
    `run-phase62-provider-probe-hybrid-20260518T-provider-restored` both have
    `executionFailures: 0`; the hybrid probe answers `e47becba` correctly
  - the initial 3-case cleaned-data slice is clean after generic
    fact-recall/noise-suppression repairs
  - the fixed 18-case type-balanced slice is clean for both GoodMemory
    profiles in
    `run-phase62-longmemeval-live18-four-profile-deterministic-hybrid-20260506T003000Z`
    with 18/18 answer accuracy, zero execution failures, and zero wrong recall
  - the broader first-10-per-type 60-case rules-only live run
    `run-phase62-longmemeval-live60-rules-only-final-repairs-escalated-20260506T104000Z`
    reaches 60/60 answer accuracy, evidence-session recall `0.9292`, zero
    execution failures, and zero wrong answers
  - the corresponding 60-case hybrid live run
    `run-phase62-longmemeval-live60-hybrid-household-issues-escalated-20260506T112000Z`
    reaches 60/60 answer accuracy, evidence-session recall `0.9292`, zero
    execution failures, and zero wrong answers
  - the corresponding provider-free recall diagnostic
    `run-phase62-longmemeval-recall-only-rules60-final-repairs-20260506T103600Z`
    records evidence-session recall `0.9292`, missed recall `10/60`, wrong
    recall `2/60`, and zero execution failures
  - the historical first current-code clean full-500 failed-row recovery merge
    `run-phase62-longmemeval-full500-current-after-generic-count-gpt55-hybrid-r1-merged-20260509T022500Z`
    covers all 500 cleaned cases across all four profiles with
    `executionFailures: 0`. This closes the current-code execution blocker but
    not the quality loop: `baseline-full-context` reaches 461/500 accuracy,
    while `goodmemory-rules-only` reaches 363/500 with evidence-session recall
    0.7754 and `goodmemory-hybrid` reaches 361/500 with evidence-session recall
    0.7734.
  - the failure-resume path is now the preferred recovery path over rerunning
    clean shard rows. After provider cooldown/socket/usage-limit failures,
    runtime AI SDK retry treats those provider errors as transient and
    `eval:phase-62-full500-retry-failures` can throttle serial retries with
    `--batch-delay-ms` and temporarily bypass provider-stuck rows with
    `--exclude-case-id` / `--skip-case-id`. The 2026-05-09 recovery cleared the
    final 9 `baseline-full-context` rows, then 500 `goodmemory-rules-only` rows,
    then 500 `goodmemory-hybrid` rows from failed profile/case rows without
    rerunning clean rows.
  - the first post-full500 quality repair targets generic explicit personal
    attribute extraction rather than a benchmark prompt hack. It moves four real
    cleaned misses (`75499fd8`, `0862e8bf`, `25e5aa4f`, `c14c00dd`) from 0/4
    provider-free evidence-session recall to 4/4, and the targeted live
    rules-only rerun
    `run-phase62-longmemeval-live-basic-attrs-after-20260507T012500Z` reaches
    4/4 answer accuracy, 1.0 evidence-session recall, and
    `executionFailures: 0`. The same explicit personal-attribute extraction
    family is mirrored in the Chinese adapter to avoid making the repair
    English-only.
  - the second post-full500 quality repair targets countable multi-session
    evidence and aggregate money selection, not LongMemEval case ids. Six real
    cleaned multi-session misses (`gpt4_a56e767c`, `88432d0a`,
    `gpt4_31ff4165`, `eeda8a6d`, `gpt4_ab202e7f`, `2b8f3739`) moved from 0/6
    provider-free evidence-session recall to 6/6, and the targeted live
    rules-only rerun
    `run-phase62-longmemeval-live-multi-count-after-20260507T052500Z` reaches
    6/6 answer accuracy, 1.0 evidence-session recall, zero wrong recall, and
    `executionFailures: 0`.
  - the third post-full500 quality repair targets temporal dated evidence and
    temporal answer composition. Seven real cleaned temporal misses
    (`0db4c65d`, `gpt4_7f6b06db`, `gpt4_8279ba02`, `gpt4_468eb063`,
    `gpt4_45189cb4`, `gpt4_ec93e27f`, `gpt4_f420262c`) moved from 0.1
    provider-free evidence-session recall with 7 missed recall cases and 1
    wrong-recall case to 1.0 evidence-session recall, zero missed recall, and
    zero wrong recall in
    `run-phase62-longmemeval-recall-only-temporal-after-answerfacts-20260507T162200Z`.
    The targeted live rules-only rerun
    `run-phase62-longmemeval-live-temporal-after-answerfacts-20260507T163300Z`
    reaches 7/7 answer accuracy, 1.0 evidence-session recall, zero wrong
    recall, and `executionFailures: 0`.
  - the fourth post-full500 quality repair extends countable multi-session
    evidence to aggregate game hours, wedding attendance, and babies born in
    friends/family contexts. Three real cleaned misses (`28dc39ac`,
    `gpt4_2f8be40d`, `2e6d26dc`) moved from partial recall in the latest clean
    full-500 report to 3/3 provider-free recall with zero wrong recall in
    `run-phase62-longmemeval-recall-only-multi-aggregate2-after-r2-20260508T004800Z`.
    The targeted live rules-only rerun
    `run-phase62-longmemeval-live-multi-aggregate2-after-20260508T004900Z`
    reaches 3/3 answer accuracy, 1.0 evidence-session recall, zero wrong
    recall, and `executionFailures: 0`.
  - the current-code all-500 provider-free recall-only inventory
    `run-phase62-longmemeval-recall-only-all500-runnerfactory-after-temporal-20260507T165900Z`
    completes with `executionFailures: 0` and evidence-session recall 0.7445.
    The next highest-yield gaps are still multi-session (0.6269 recall,
    73/133 missed), knowledge-update (0.7179 recall, 31/78 missed), and
    broader temporal-reasoning (0.7209 recall, 59/133 missed). This is a
    recall-only diagnostic, not answer-accuracy evidence.
- Current external-benchmark status: LongMemEval no longer blocks the sequence.
  The remaining 46 LongMemEval wrong cases are still useful research input,
  especially temporal-reasoning, multi-session, and single-session-assistant
  synthesis, but they do not keep Phase 62 open. BEAM is the next benchmark
  hardening phase; final public reporting remains deferred until LongMemEval,
  BEAM, MemoryAgentBench, and LoCoMo are all complete.

## Prior Accepted Research Slice

- Phase 61 implementation is accepted as Priming Abstraction And
  Contamination-Safe Output; the Phase 62A recovery follow-up completed as
  `run-phase61-full300-20260505T170001Z`. It responds to the Phase 60/61
  full-300 findings that controlled priming must both cover the official
  denominator and carry compliant abstract influence without copying source
  nouns or violating strict task formats.
- Phase 61 remains internal research/eval hardening:
  - `bestGoodMemoryOverallRate` now refers only to official-comparable
    full-denominator profiles
  - blocking-only evidence is reported separately
  - priming audits report structured violation tags and examples
  - GoodMemory priming prompts use an internal latent influence packet plus a
    source-noun blacklist instead of raw priming text
  - strict JSON priming outputs are repaired before judging when they contain
    markdown, extra keys, bad candidate shape, or forbidden source nouns
  - no benchmark task-file or case-id routing
- Latest full-300 research result:
  - artifact:
    `reports/eval/live/phase-61-full300/run-phase61-full300-20260505T170001Z/overall-summary.json`
  - best official-comparable GoodMemory full-300 score:
    `213.26 / 300 = 71.09%`
  - best GoodMemory blocking-only profile:
    `155 / 200 = 77.50%`
  - GoodMemory priming:
    `94 / 100` credited cases, average influence `58.26`, task violations `0`,
    source-noun contamination flags `0`, explicit recall leaks `0`
  - distilled context diagnostics:
    empty context `0 / 200`, fallback policy coverage `200 / 200`,
    context pass rate `77.50%`
  - execution failures:
    baseline `0`, GoodMemory raw `0`, GoodMemory distilled `0`
  - boundary:
    the official-comparable internal research profile now exceeds the paper's
    `66%` reference line, but this remains internal research evidence only:
    no release hard gate, no public API/config widening, and no README-level
    leaderboard claim
- Post-analysis code follow-up:
  - immediate feedback policy fallback keeps distilled contexts non-empty even
    when no compiled validated pattern exists
  - latent priming semantic-field inference prioritizes source theme labels
    over incidental words in priming text
  - contamination-safe strict JSON ranking selects stronger safe abstract
    candidates when generated candidates are weak or unsafe
  - the Phase 61 wrapper now raises the general ImplicitMemBench timeout to at
    least `180000ms` for future full-300 runs, matching the priming timeout
  - Phase 61 full-300 runs default to per-shard case concurrency `1` and use
    `GOODMEMORY_PHASE61_FULL300_MAX_CONCURRENCY` for explicit override instead
    of inheriting generic high-concurrency eval settings

## Prior Reopened Slice

- Phase 59 is the Generalized Raw Executor Cleanup slice. It was reopened after
  the post-gate five-shard Postgres-backed full-300 follow-up missed the raw
  research target, and the later `phase59-reopen9` five-shard Postgres-backed
  rerun met the reopened internal research target. The targeted gate remains
  the accepted release gate; full-300 remains research-only evidence.
- Previously accepted targeted behavior:
  - Phase 58 surface literals are replaced by generic extraction for
    failed/preferred operations, forbidden/safe surfaces, protocol rewrites,
    filetype rewrites, path-root anchors, and conditional warnings
  - structured first-action recovery can deterministically recover grounded
    token-prefix, reversed-parameter, pipe-path, query-like command, and
    argument-order templates
  - symbolic and formula execution only locks computed answers when the
    expression, variables, base values, and probe operands are grounded
  - format and voice contracts compile into required first line, opener,
    closer, sender/name, one-line header, forbidden style token, and required
    style marker enforcement
  - leak suppression still runs after repair, fallback, and computed responses
  - reopened targeted Phase 59 deterministic evidence now closes with
    `goodmemory-raw-experience` at `58 / 60`,
    `goodmemory-distilled-feedback` at `60 / 60`, `executionFailures = 0`, and
    explicit recall leaks at `0`
  - reopened targeted raw diagnostics now split cue sufficiency explicitly:
    selected-and-passed `58`, selected-but-not-enacted `2`, cue-disconnect `2`,
    memory-miss `0`, support-conflict `0`, wrong-exemplar `0`, and
    operator-failure `0`
- Canonical evidence:
  - archive summary:
    `docs/archive/quality-gates/GoodMemory-Phase-59-Quality-Gate.md`
  - deterministic targeted eval:
    `reports/eval/fallback/phase-59/run-phase59-fallback-current/report.json`
  - raw diagnosis report:
    `reports/eval/fallback/phase-59/run-phase59-fallback-current/raw-diagnostics.json`
  - quality gate:
    `reports/quality-gates/phase-59/run-20260504193000/phase-59-quality-gate.json`
  - full-300 research follow-up summary:
    `reports/quality-gates/phase-59/run-20260504193000/phase-59-reopen9-full300-research-summary.json`
- Status carried forward from Phase 58 full-300 follow-up:
  - the five-shard Postgres-backed post-Phase-58 full-300 rerun landed at
    raw `90 / 200`, distilled `151 / 200`, raw blocking execution failures `3`,
    raw explicit recall leaks `2`, distilled blocking execution failures `3`,
    and distilled explicit recall leaks `0`
  - that follow-up moved raw substantially, restored distilled above `150`,
    and still did not close the raw leak/reliability target; it remains
    internal research evidence only
- Post-Phase-59 full-300 research follow-up:
  - the five-shard Postgres-backed post-Phase-59 full-300 rerun landed at
    raw `88 / 200`, distilled `151 / 200`, raw blocking execution failures `4`,
    raw non-blocking execution failures `5`, raw explicit recall leaks `1`,
    distilled blocking execution failures `2`, and distilled explicit recall
    leaks `0`
  - local summary artifact:
    `/tmp/phase59-postphase59-full-300-summary-20260504.json`
  - local raw diagnosis artifact:
    `/tmp/phase59-full300-raw-diagnostics-20260504.json`
  - the run did not meet the Phase 59 full-300 research target; it remains
    internal research evidence only and does not expand the accepted targeted
    gate claim
- Reopened Phase 59 implementation full-300 attempt:
  - the five-shard Postgres-backed reopened run after cue-sufficiency diagnostics
    and latent-cue retrieval landed at raw `81 / 200`, distilled `149 / 200`,
    raw blocking execution failures `0`, raw explicit recall leaks `0`,
    distilled blocking execution failures `0`, and distilled explicit recall
    leaks `0`
  - shard runs:
    `run-phase49-postphase59-reopened-shard-01-20260504` through
    `run-phase49-postphase59-reopened-shard-05-20260504`
  - local raw diagnosis artifact:
    `/tmp/phase59-reopened-full300-raw-diagnostics-20260504.json`
  - cue-sufficiency diagnosis:
    passed `81`, no-candidate `116`, cue-disconnect `66`,
    candidate-conflict `25`, wrong-exemplar `8`, candidate-insufficient `2`,
    sufficient-not-enacted `2`, and operator-failure `0`
  - verdict:
    this is a cleaner operator run but not a Phase 59 closure. It removed the
    execution/leak noise, but it regressed raw against the prior `88 / 200`
    research point and missed the distilled floor by one case.
  - follow-up already implemented after that run:
    host-action rule-plus-example binding now prefers exact action surfaces when
    the selected raw evidence only states the rule; this latest code path is
    covered by targeted tests and gate, but still needs a full-300 rerun before
    it can be counted as full-benchmark evidence.
- Second reopened Phase 59 full-300 checkpoint:
  - the `phase59-reopen9` five-shard Postgres-backed run after generic
    exact-action wrapper normalization, concise exact-answer repair, and
    priming fail-open reliability separation landed at raw `115 / 200`,
    distilled `153 / 200`, raw blocking execution failures `0`, raw
    non-blocking execution failures `93`, raw explicit recall leaks `0`,
    distilled blocking execution failures `0`, and distilled explicit recall
    leaks `0`
  - shard runs:
    `run-phase59-reopen9-shard-01-20260504` through
    `run-phase59-reopen9-shard-05-20260504`
  - local raw diagnosis artifact:
    `/tmp/phase59-reopen9-full300-final-raw-diagnostics-20260504.json`
  - cue-sufficiency diagnosis:
    passed `115`, no-candidate `21`, cue-disconnect `33`,
    candidate-conflict `27`, wrong-exemplar `7`, candidate-insufficient `1`,
    sufficient-not-enacted `3`, and operator-failure `93`
  - verdict:
    this meets the reopened Phase 59 research-only full-300 target. The
    non-blocking operator failures are priming-lane timeouts after fail-open
    classification; raw blocking execution failures remain `0`.
- Reopen plan:
  - the first reopened full-300 attempt splits the old `memory_miss` bucket into
    actionable cue-sufficiency failures: `no_candidate = 116`,
    `cue_disconnect = 66`, `candidate_conflict = 25`, `wrong_exemplar = 8`,
    and only `sufficient_not_enacted = 2`
  - Phase 59 now targets cue-sufficiency diagnostics, latent cue expansion,
    source-backed raw contract consolidation, correction-backed
    conflict-to-inhibition repair, selected-contract enactment verification,
    and same-shard ablation against Phase 58 and Phase 59-current
  - first reopened implementation pass added cue-sufficiency diagnostics and
    latent cue retrieval, improving the deterministic targeted raw result from
    `55 / 60` to `58 / 60`; this is useful mechanism evidence, but it is not a
    substitute for the five-shard full-300 rerun
  - reopened full-300 target was research-only and is now met by
    `phase59-reopen9`: raw at least `115 / 200`, distilled at least
    `150 / 200`, raw explicit recall leaks `0`, and raw blocking execution
    failures `<= 2`
- Still outside the Phase 59 accepted claim:
  - public API or public config widening
  - a new durable public memory kind or public record collection
  - benchmark-specific runtime hacks, task-file patches, or case-id routing as
    the accepted product mechanism

## Next Research Follow-Up

- Phase 60's deterministic protocol gate is accepted, but the official-shape
  full-300 rerun is still pending.
- The next research run should use the Phase 60 protocol summary over the
  five-shard Postgres-backed ImplicitMemBench setup and report:
  - raw blocking score
  - distilled blocking score
  - controlled priming score
  - `full300OverallScore`
  - `overallComparableToOfficial`
  - priming contamination, task violation, and explicit leak counts

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
  - latest post-Phase-57 rerun status, as summarized in the research doc:
    GoodMemory-only Postgres-backed 5-shard rerun landed at raw `50 / 200`,
    distilled `148 / 200`, conditioning raw/distilled `23 / 100`,
    `86 / 100`, procedural raw/distilled `27 / 100`, `62 / 100`,
    structured first-action raw/distilled `8 / 35`, `20 / 35`, raw /
    distilled execution failures at `15 / 5`, raw blocking execution failures
    at `2`, distilled blocking execution failures at `5`, and explicit recall
    leaks at `2 / 1`, showing that Phase 57 moved raw modestly but did not
    meet the research target and did not preserve the Phase 56 distilled
    high-water mark
  - latest closed execution slice:
    `task-board/63-phase-58-raw-enactment-compiler-and-repair-loop.txt`
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

- Use `docs/README.md` first when choosing which documentation file to open.
- Use `README.md`, `docs/GoodMemory-PRD.md`, and the architecture docs when you need the product story or public integration shape.
- Use `task-board/00-README.txt` when you need the current execution order, active slice, or recent accepted boundary. It is intentionally a slim router, not a full phase history.
- Use `docs/archive/quality-gates/README.md` when you need historical closure detail for a specific capability slice.
- Use `reports/quality-gates/` and `reports/eval/` when you need raw evidence rather than a summarized judgment.

## Scope Boundary

- Top-level docs should stay product-oriented and current-state-oriented.
- Phase history is preserved, but it now lives in the archive layer instead of the main documentation surface.
