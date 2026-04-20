Phase 26 Breakdown
==================

Status
------
- Phase 26 is decomposed into executable slices and ready for step-by-step development.
- Phase acceptance is still open; use the files below in order.

Execution Order
---------------
1. 01-default-resolution-contract.txt
2. 02-auto-resolution-and-runtime-wiring.txt
3. 03-sqlite-local-vector-store.txt
4. 04-cli-and-regressions.txt
5. 05-docs-and-closure.txt

Acceptance
----------
- explicit provider selection overrides auto mode
- auto mode uses Postgres only when both the connection target and `pgvector` are usable
- SQLite vector storage passes the shared `VectorStore` contract.
- `sqlite + embeddingAdapter + local vector runtime` enables durable local hybrid retrieval.
- `sqlite + no embeddingAdapter` remains `rules-only`.
- Boot failure is explicit when local semantic mode is required.
- Postgres behavior and the stable public API stay compatible.

Files in This Folder
--------------------
- 01-default-resolution-contract.txt
  Lock the product contract for explicit-vs-auto storage and embedding fallback.

- 02-auto-resolution-and-runtime-wiring.txt
  Implement the shared resolver and runtime factory behavior.

- 03-sqlite-local-vector-store.txt
  Land durable SQLite vector storage and any extension/bootstrap guardrails.

- 04-cli-and-regressions.txt
  Align CLI behavior and add end-to-end regression coverage.

- 05-docs-and-closure.txt
  Sync release-facing docs and define closure evidence for the phase.
