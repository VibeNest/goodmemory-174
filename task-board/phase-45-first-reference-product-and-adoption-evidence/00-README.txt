Phase 45 Breakdown: First Reference Product And Adoption Evidence
=================================================================

Follow the parent task file:

- `task-board/50-phase-45-first-reference-product-and-adoption-evidence.txt`

Task order:

1. reference product contract and failing boundary tests
2. reference product runtime
3. product memory scenarios
4. A/B adoption evidence
5. local viewer inspectability without mutation
6. package/docs proof and quality gate

Working rules:

- Prove a real product adoption path, not another internal infrastructure slice.
- Use public package exports or the `goodmemory/http` bridge only.
- Keep GoodMemory framed as a memory layer, not a complete chat platform.
- Keep the viewer local-only and read-only.
- Use CLI/API handoff for forget/revise rather than browser mutations.
- Allow authenticated reference-product backend mutation flows; never allow the
  local viewer to execute browser mutations.
- Keep durable writes explicit: observe is audit/inspectability unless a scenario
  explicitly enables selective writeback.
- Do not persist raw transcripts in accepted reports.
- Do not add cloud, dashboard, account, sync, or analytics claims.
- Do not widen the root `goodmemory` public API.

Exit result:

- One reference product boots from package/public surfaces.
- One memory loop shows product value over a no-memory baseline.
- One local viewer flow makes traces, sessions, and writeback audit inspectable.
- One correction/forget/revise path works end to end without viewer mutation.
- One Phase 45 adoption report and quality gate close the phase.

Accepted evidence:

- `reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json`
- `reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json`
- `docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md`
