Phase 33 Breakdown
==================

Status
------
- Phase 33 is closed and accepted.
- Scope: replace the Bun-only RC package boundary with a formal Node-compatible library contract for mainstream Node/TypeScript adopters.
- Canonical public packages:
  - `goodmemory`
  - `goodmemory/ai-sdk`
  - `goodmemory/host`
- Bun remains the canonical repo-local development and gate runner, but Node LTS becomes a gate-blocking public consumer/runtime boundary in this phase.
- Bun-only CLI behavior and Bun-local sqlite/sqlite-vss runtime code must be isolated instead of leaking through the default package contract.
- The compiled package boundary, Bun-backed CLI wrapper isolation, Node consumer smoke, and CI matrix are now landed.
- Canonical closure evidence:
  - `docs/archive/quality-gates/GoodMemory-Phase-33-Quality-Gate.md`
  - `reports/quality-gates/phase-33/run-20260422120359/phase-33-quality-gate.json`


Execution Order
---------------
1. 01-freeze-formal-node-compatible-contract.txt
2. 02-build-dist-and-declarations.txt
3. 03-isolate-bun-runtime-specifics.txt
4. 04-node-and-bun-consumer-matrix.txt
5. 05-node-first-ai-sdk-integration.txt
6. 06-phase-33-gate-and-closure.txt


Acceptance
----------
- the formal library contract is Node-compatible for `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host`
- built artifacts and declarations replace direct `src/*.ts` exports on the public install surface
- canonical Node imports do not statically depend on `bun:sqlite`, `Bun.*`, or Bun-only CLI code
- Bun-only runtime paths remain available only through explicit runtime-specific boundaries
- installed-package consumer smoke and type smoke pass in Node LTS and Bun
- CI enforces the public package boundary in Node 20, Node 22, and Bun
- one canonical Node-first AI SDK integration path is documented with public imports only
- closure evidence archives one canonical Node-first installed-consumer run plus synchronized gate/docs/task-board state


Canonical Inputs
----------------
- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `docs/GoodMemory-OSS-Architecture-v1.md`
- `docs/GoodMemory-Reference-Integration-Guide.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `task-board/30-phase-29-bun-only-release-hardening-0.1.0-rc.1.txt`
- `task-board/33-phase-32-external-host-integration-productization.txt`


Files in This Folder
--------------------
- 01-freeze-formal-node-compatible-contract.txt
  Freeze the adoption-facing contract, the runtime split, and the out-of-scope boundaries.

- 02-build-dist-and-declarations.txt
  Add standard build outputs, declarations, and export-map wiring for the canonical public packages.

- 03-isolate-bun-runtime-specifics.txt
  Separate Bun-only CLI and Bun-local sqlite/sqlite-vss runtime behavior from the Node-compatible import graph.

- 04-node-and-bun-consumer-matrix.txt
  Expand installed-package verification into Node LTS plus Bun runtime/type/CI coverage.

- 05-node-first-ai-sdk-integration.txt
  Ship the canonical Node-first AI SDK integration path and adoption docs.

- 06-phase-33-gate-and-closure.txt
  Add the dedicated Phase 33 gate, archive canonical package-boundary evidence, and sync stable board/docs entrypoints.
