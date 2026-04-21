Phase 28 Breakdown
==================

Status
------
- Phase 28 is queued.
- Phase 27 is closed and accepted.
- Scope: turn the accepted Phase 26 durable local SQLite baseline into a real, supported `sqlite-vss` accelerated backend when embeddings are configured and the local runtime is actually available.

Execution Order
---------------
1. 01-runtime-contract-and-boundary.txt
2. 02-real-indexed-backend.txt
3. 03-runtime-bootstrap-and-assets.txt
4. 04-regressions-and-closure.txt

Acceptance
----------
- local accelerated mode uses real `sqlite-vss` indexing on supported runtimes
- the repo has non-mocked evidence for the accelerated path
- durable fallback remains available and explicit when acceleration is unavailable
- `rules-only` remains the outcome when `GOODMEMORY_EMBEDDING_*` is absent
- Phase 26 auto-resolution and explicit-provider guarantees remain intact
- closure points to one canonical quality-gate evidence chain

Files in This Folder
--------------------
- 01-runtime-contract-and-boundary.txt
  Define the exact boundary between accelerated local mode, durable fallback, and rules-only behavior.

- 02-real-indexed-backend.txt
  Replace “extension-assisted scoring over the durable table” as the primary accelerated claim with a real `sqlite-vss` indexed backend.

- 03-runtime-bootstrap-and-assets.txt
  Define how supported runtimes load the required local vector assets and how capability detection is surfaced.

- 04-regressions-and-closure.txt
  Add the end-to-end regressions, dedicated gate, archived quality-gate summary, and task-board/doc sync.
