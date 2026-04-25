Phase 39 Breakdown: Python HTTP Integration Bridge
==================================================

This folder contains the implementation checklist for making GoodMemory easy to
adopt from Python/FastAPI backends without widening the root public API.
OneLife is the first reference consumer.

Follow the parent task file:

- `task-board/41-phase-39-python-http-integration-bridge.txt`

Working rules:

- TDD first.
- Keep Phase 36, Phase 37, and Phase 38 accepted claims regression-covered.
- Do not add a built-in OneLife preset.
- Keep Expo/Web clients unaware of GoodMemory internals; the server boundary is
  Python/FastAPI to Node/Bun HTTP.
- Treat the bridge as backend-only. Browser/mobile clients must call the
  product backend, and export/forget/revise operations must pass product-owned
  authorization and scoped user/tenant validation.
- Prefer a thin bridge/example over new root public API expansion.
- Keep consumer product memory policy product-owned; GoodMemory is the semantic
  memory layer and runtime facade. OneLife is the first reference case.
- Treat `/memory/feedback` as a retry-safe procedural signal endpoint with
  explicit idempotency and source/provenance metadata, not as an unscoped
  catch-all fact write.
- If the bridge exposes `mode: "async"` for remember, keep it as transport
  control that chooses `memory.jobs.enqueueRemember()`; do not add
  `remember({ mode: "background" })`.
- Use targeted `reviseMemory()` only after the product has resolved an explicit
  `memoryId`; do not add query-resolved correction in this phase.
- Keep proposal/review, `lock`, and "do not remember this" semantics on the
  consumer side first; only explicit visible-target outcomes should map to
  `revise` or `forget`.
- Let the consuming app own session lifecycle. GoodMemory runtime may support
  scoped continuity snapshots or summary-only runtime state, but raw transcript
  archive remains off by default.
- Do not persist raw transcripts by default.
- After each slice, run targeted regressions and update docs/examples together.
