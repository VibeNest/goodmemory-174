Phase 38 Breakdown: Governed Runtime Surface
============================================

Follow the parent task file:

- `task-board/40-phase-38-governed-runtime-surface.txt`

Working rules:

- TDD first.
- Keep Phase 37.1 accepted evidence immutable.
- Do not widen root public write APIs around governance.
- Do not persist raw transcripts by default.
- Add public surface only through `createGoodMemory()` and existing package exports unless a later task explicitly proves a new subpath is needed.
- After each task, run targeted regressions plus `bun run typecheck`.

Task order:

1. traceSink contract and core public API span emission
2. targeted `reviseMemory()`
3. `memory.runtime.*` facade
4. background write jobs
5. provider facade
6. Express/Fastify examples
7. Phase 38 quality gate and closure docs
