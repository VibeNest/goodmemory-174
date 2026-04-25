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
- Prefer a thin bridge/example over new root public API expansion.
- Keep consumer product memory policy product-owned; GoodMemory is the semantic
  memory layer and runtime facade. OneLife is the first reference case.
- Do not persist raw transcripts by default.
- After each slice, run targeted regressions and update docs/examples together.
