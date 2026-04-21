# GoodMemory Phase 27 Quality Gate

Canonical accepted gate run: `run-20260421011515`

## Command

```bash
bun run gate:phase-27
```

This gate validates the canonical deterministic and live Phase 27 eval artifacts, then reruns the Phase 27 deterministic closure checks:

- `bun run typecheck`
- `bun test tests/unit/run-phase-27.script.test.ts tests/unit/run-phase-27.gate.test.ts tests/examples/examples.test.ts tests/release/release.test.ts`
- `bun run eval:phase-27`

The live provider-backed slice is not rerun inside the default gate. Instead, the gate requires one canonical archived live report to already exist and remain accepted.

## Scope

- Public reference hardening over `createGoodMemory({})` and public-only imports.
- Package-boundary consumer smoke for `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host`.
- Deterministic adoption evidence for:
  - identity/background understanding
  - continuation/open-loop carry-forward
  - repeated-correction reduction
  - Codex handoff/resume
- Canonical provider-backed live adoption evidence for continuation/open-loop and repeated-correction.
- Codex as the only gate-blocking host path in this phase.

Out of scope:

- installer CLI or package publishing automation
- `src/core` / facade refactors
- new memory capabilities beyond the accepted local-first runtime
- making Claude a second gate-blocking host path

## Canonical Artifacts

- Deterministic adoption eval:
  - `reports/eval/fallback/phase-27/run-20260420165836/report.json`
- Live-memory adoption eval:
  - `reports/eval/live-memory/phase-27/run-20260420175513/report.json`
- Quality gate:
  - `reports/quality-gates/phase-27/run-20260421011515/phase-27-quality-gate.json`

## Results

- Deterministic adoption eval: accepted.
- Live-memory adoption eval: accepted.
- Quality gate: accepted.
- Execution failures: `0` on the canonical deterministic and live reports.
- Deterministic thresholds proven on the canonical report:
  - identity/background: `3/3` GoodMemory wins
  - continuation/open-loop: `6/6` GoodMemory wins
  - repeated-correction improvement: `100` percentage points
  - Codex handoff/resume: `3/3` pass
- Live adoption thresholds proven on the canonical report:
  - continuation/open-loop coverage: `2/2`
  - repeated-correction coverage: `2/2`
  - GoodMemory wins `4/4`, baseline wins `0/4`

## Acceptance Decision

Phase 27 is accepted as the reference-integration gate and adoption-evidence slice.
It proves that GoodMemory's public reference path is adoptable on top of the accepted Phase 26 local-first runtime, that the docs-as-written path stays on public package surfaces, that deterministic and live adoption evidence both favor GoodMemory over the frozen no-memory baseline, and that Codex file-assisted handoff/resume is stable as the single gate-blocking host path.
