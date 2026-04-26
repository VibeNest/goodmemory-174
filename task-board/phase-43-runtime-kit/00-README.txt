Phase 43 Breakdown: Runtime Kit
===============================

Follow the parent task file:

- `task-board/46-phase-43-runtime-kit.txt`

Task order:

1. [DONE] contract and failing tests
2. [DONE] public runtime-kit export
3. [DONE] lifecycle orchestration
4. [DONE] preAction and installed-host adapters
5. [DONE] afterModelCall governance
6. [DONE] AI SDK and Claude parity
7. [DONE] evals, gate, docs, and closure

Working rules:

- Reuse Phase 42 progressive recall.
- Reuse Phase 41 pre-action contracts.
- Do not make worker daemon part of Phase 43 closure.
- afterModelCall must not become default-on durable writeback.

Accepted evidence:

- deterministic eval: `reports/eval/fallback/phase-43/run-20260426113000/report.json`
- quality gate: `reports/quality-gates/phase-43/run-20260426120000/phase-43-quality-gate.json`
- archive summary: `docs/archive/quality-gates/GoodMemory-Phase-43-Quality-Gate.md`
