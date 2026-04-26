Phase 43.5 Breakdown: Optional Runtime Worker
=============================================

Follow the parent task file:

- `task-board/47-phase-43-5-optional-runtime-worker.txt`

Task order:

1. contract and failing tests
2. bounded job envelope
3. drain-once, status, and recover dry-run
4. optional daemon start/stop
5. audit, redaction, and failure isolation
6. evals, gate, docs, and closure

Working rules:

- Worker is optional.
- Inline runtime path must remain valid.
- Do not store raw transcripts.
- Drain/status/recover close before daemon behavior.
