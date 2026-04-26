Phase 43.5 Breakdown: Optional Runtime Worker
=============================================

Follow the parent task file:

- `task-board/47-phase-43-5-optional-runtime-worker.txt`

Task order:

1. [DONE] contract and failing tests
2. [DONE] bounded job envelope
3. [DONE] drain-once, status, and recover dry-run
4. [DONE] optional daemon start/stop
5. [DONE] audit, redaction, and failure isolation
6. [DONE] evals, gate, docs, and closure

Working rules:

- Worker is optional.
- Inline runtime path must remain valid.
- Do not store raw transcripts.
- Drain/status/recover close before daemon behavior.

Accepted evidence:

- deterministic eval: `reports/eval/fallback/phase-43-5/run-20260426133000/report.json`
- quality gate: `reports/quality-gates/phase-43-5/run-20260426140000/phase-43-5-quality-gate.json`
- archive summary: `docs/archive/quality-gates/GoodMemory-Phase-43.5-Quality-Gate.md`
