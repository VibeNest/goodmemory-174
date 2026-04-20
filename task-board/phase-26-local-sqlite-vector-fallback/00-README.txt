Phase 26 Breakdown
==================

Status
------
- Phase 26 is queued and not started.
- Scope: add the intended default runtime resolution:
  - explicit `sqlite` / `postgres` wins
  - auto Postgres when usable
  - otherwise local SQLite
  - embeddings only when `GOODMEMORY_EMBEDDING_*` exists

Tasks
-----
[TODO] P26-T001 Define the default storage and embedding resolution contract
[TODO] P26-T002 Add resolver tests for explicit provider, auto Postgres, auto SQLite, and rules-only fallback
[TODO] P26-T003 Add SQLite vector-store contract tests
[TODO] P26-T004 Implement SQLite vector storage and runtime bootstrap handling
[TODO] P26-T005 Wire runtime selection so auto SQLite no longer falls back to in-memory vectors
[TODO] P26-T006 Add end-to-end regressions for remember, recall, forget, and governance
[TODO] P26-T007 Sync docs only after runtime behavior and tests are real

Acceptance
----------
- explicit provider selection overrides auto mode
- auto mode uses Postgres only when both the connection target and `pgvector` are usable
- SQLite vector storage passes the shared `VectorStore` contract.
- `sqlite + embeddingAdapter + local vector runtime` enables durable local hybrid retrieval.
- `sqlite + no embeddingAdapter` remains `rules-only`.
- Boot failure is explicit when local semantic mode is required.
- Postgres behavior and the stable public API stay compatible.
