# GoodMemory Phase 45 Quality Gate

Canonical accepted gate run: `run-20260427110000`

Phase 45 closes the First Reference Product and Adoption Evidence slice. The
accepted reference product path is `examples/reference-chat-product`, a small
product-shaped chat backend that uses GoodMemory only through public package
exports or the authenticated `goodmemory/http` bridge.

This proves adoption of GoodMemory as a memory layer for a real app boundary. It
is not a hosted dashboard, cloud service, account system, analytics layer, new
root API, or viewer write UI.

## Evidence

- Adoption report:
  - `reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json`
  - Regenerate with `bun run eval:phase-45 --run-id run-20260427104530-adoption-eval`
- Quality gate:
  - `reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json`
  - Regenerate with `bun run gate:phase-45 --run-id run-20260427110000`

## Accepted Product Surface

- `bun run example:reference-product` boots the Bun smoke path.
- FastAPI consumers start the packaged bridge with `goodmemory-http-bridge`.
- The TypeScript product imports `goodmemory` and `goodmemory/http`, not repo
  internals.
- The FastAPI product calls authenticated bridge endpoints for recall, remember,
  feedback, export, forget, and targeted revise.
- Product idempotency is owned by the product boundary before side effects.

## Adoption Coverage

The accepted adoption report covers:

- observed no-memory baseline
- rules-only GoodMemory reference-product run
- provider-backed uplift as explicit skipped local evidence, with requested
  provider-backed runs blocked until a real provider execution path exists
- identity/background continuity
- project and coding-style preferences
- historical task continuation
- correction through targeted revise
- wrong-memory forget
- procedural feedback memory
- observe candidate reviewability
- selective writeback followed by next-turn recall
- no-provider rules-only fallback

## Viewer Boundary

The local viewer remains read-only. Phase 45 uses it for inspectability only:

- summary view
- progressive `gmrec:v1` record drill-down
- writeback/session/trace summaries
- forget/revise handoff commands generated for operator review
- POST/PUT/PATCH/DELETE rejection
- cross-scope handoff rejection

Backend revise and forget mutations are proven through authenticated
reference-product API/bridge flows outside the viewer.

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- Phase 45 reference-product, adoption-eval, gate, viewer, and Python bridge
  regressions
- canonical `eval:phase-45` regeneration
- `bun run example:reference-product`
- release assertions for package metadata, tarball hygiene, current-status,
  task-board, archive alignment, root API non-widening, and ignored generated
  adoption reports

## Outside The Accepted Claim

- hosted dashboard, managed cloud, account system, sync, team workspace, or
  analytics
- viewer mutation routes or browser-executed forget/revise
- raw transcript archive or full assistant-output persistence
- CORS-enabled remote viewer API
- provider-backed retrieval rollout or quality-promotion claims
- new installed-host hook capability
- new root `goodmemory` public API
