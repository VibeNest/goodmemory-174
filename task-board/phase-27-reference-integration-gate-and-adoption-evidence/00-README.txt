Phase 27 Breakdown
==================

Status
------
- Phase 27 is closed and accepted.
- Slice 27.1 public reference hardening is implemented and regression-covered.
- Slice 27.2 deterministic adoption eval is implemented and regression-covered.
- Slice 27.3 live adoption evidence is implemented and backed by one canonical archived live run.
- Slice 27.4 Codex handoff gate and closure artifacts are implemented.
- Scope: prove the public reference path on top of the accepted Phase 26 local-first runtime:
  - `createGoodMemory({})` as the canonical default runtime entrypoint
  - public `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host` imports only
  - deterministic + live adoption evidence
  - Codex file-assisted handoff as the single gate-blocking host path

Execution Order
---------------
1. 01-public-reference-hardening.txt
2. 02-deterministic-adoption-eval.txt
3. 03-live-adoption-evidence.txt
4. 04-codex-handoff-gate-and-closure.txt

Acceptance
----------
- the canonical AI SDK path uses `createGoodMemory({})` and the stable Phase 26 auto-storage default
- gated docs/examples/tests use only public imports and no `../src/*` paths
- the package-boundary consumer smoke fixture proves package-name imports work inside the repo boundary
- deterministic adoption families cover:
  - 3 identity/background cases
  - 6 continuation/open-loop cases
  - 4 repeated-correction cases
  - 3 Codex handoff/resume cases
- deterministic thresholds are:
  - identity/background: GoodMemory wins at least 2 of 3
  - continuation/open-loop: at least 2 net GoodMemory wins and baseline wins at most 1
  - repeated-correction: at least 25 percentage point improvement
  - Codex handoff/resume: 3 of 3 pass
- setup-surface and public-reference-purity metrics both pass
- at least 1 archived live run exists for continuation/open-loop plus repeated-correction, with a strict majority of GoodMemory wins and baseline winning at most 1 case
- Claude remains non-gating docs/example coverage only

Canonical Closure Evidence
--------------------------
- `reports/eval/fallback/phase-27/run-20260421165000/report.json`
- `reports/eval/live-memory/phase-27/run-20260421170500/report.json`
- `reports/quality-gates/phase-27/run-20260421172000/phase-27-quality-gate.json`
- `docs/archive/quality-gates/GoodMemory-Phase-27-Quality-Gate.md`

Files in This Folder
--------------------
- 01-public-reference-hardening.txt
  Convert canonical reference paths to public imports and stable local-first runtime defaults.

- 02-deterministic-adoption-eval.txt
  Add baseline-frozen deterministic adoption families, thresholded reporting, and the canonical `eval:phase-27` runner.

- 03-live-adoption-evidence.txt
  Add provider-backed live evidence for the reference integration path and archive one canonical live run once the required env is available.

- 04-codex-handoff-gate-and-closure.txt
  Gate one canonical Codex handoff/resume path and archive Phase 27 closure evidence.
