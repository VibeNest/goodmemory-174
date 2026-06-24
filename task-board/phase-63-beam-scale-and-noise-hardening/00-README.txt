Phase 63 Breakdown: BEAM Scale And Noise Hardening
==================================================

This breakdown is intentionally compact. It lists current work and accepted
boundaries only; use generated reports and git history for provenance.

Current Boundary
----------------

- Phase 63 is active and partial.
- Phase 62 LongMemEval is accepted and no longer blocks BEAM.
- Current Phase 63 work is answer-gap hardening with recall/noise follow-up.
- The latest accepted BEAM full-run evidence is a measured checkpoint, not
  performance closure and not a public benchmark claim.
- Main phase file: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`

Accepted Evidence
-----------------

- LongMemEval accepted close:
  `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`,
  454/500 answer accuracy, evidence-session recall 0.9590, missed recall 35,
  wrong recall 6, wrong answers 46, and `executionFailures: 0`.
- BEAM smoke: `run-phase63-beam-smoke-current`, gate `run-20260518003000`.
- BEAM adapter proof: `run-phase63-beam-100k-full-initial-20260518T000335Z`,
  real 100K export, all four profiles, `executionFailures: 0`.
- Latest retained recall diagnostic:
  `run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z`,
  evidence-chat recall 0.9620612564274538, missed 20/355,
  wrong-recall/noise 167/400, zero-recall 0.
- Latest accepted measured full-run checkpoint:
  `run-phase63-beam-100k-live-closure-gpt55-evidence-pack-answer-hardening-current`,
  278/400 answer accuracy (0.695), wrong-answer 122/400,
  evidence-chat recall 0.9620612564274538, `executionFailures: 0`, gate
  `run-phase63-beam-closure-gate-gpt55-evidence-pack-answer-hardening-current` accepted.
- Prior evidence-pack checkpoint:
  `run-phase63-beam-100k-live-closure-gpt55-evidence-pack-current`,
  261/400 answer accuracy (0.6525), same recall.
- Prior no-pack baseline:
  `run-phase63-beam-100k-live-closure-gpt55-current`, 224/400 answer accuracy
  (0.56), same recall.

Current Task Queue
------------------

1. Use the latest local answer-hardening answer-gap analysis:
   `run-phase63-beam-live-answer-gap-answer-hardening-current`, 122 wrong
   answers: 58 full-recall-clean, 37 full-recall-noisy, 15 missing-evidence,
   7 abstention, 5 unknown.
2. Compare it with the existing no-pack baseline analyzer:
   `run-phase63-beam-live-answer-gap-baseline-current` (176 wrong: 103
   full-recall-clean, 41 full-recall-noisy, 18 missing-evidence) and the prior
   evidence-pack analyzer `run-phase63-beam-live-answer-gap-evidence-pack-current`
   (139 wrong: 76 full-recall-clean, 34 full-recall-noisy,
   16 missing-evidence).
3. Prioritize conflict_update 29 and temporal_order 24 because both are
   dominated by full-recall-clean failures; use instruction_following 27 for
   noise-budgeting follow-up because it is dominated by full-recall-noisy
   failures.
4. Live-measured answer-pack hardening has landed: optional question-type-aware
   operation routing, explicit timeline evidence, order requested-count/topic
   answer-shape guidance, value-bearing count tables, summary framing,
   multi-session facet framing, instruction standing/latest constraint framing,
   and current-value framing for update/conflict/CR questions that avoids
   yes/no-only contradiction answers. The latest hard-slice was 10/12 and the
   full run improved to 278/400, but this is still not performance closure.
5. Revisit instruction_following 27 through noise budgeting because the latest
   analyzer still shows full-recall-noisy failures after the instruction
   constraint framing.
6. Return to recall selection only for missing-evidence families.
7. Validate answer-time gains against Phase 64 MemoryAgentBench CR before
   treating any BEAM gain as general.

Acceptance Checks
-----------------

- Documentation remains clear that the 0.695 run is pipeline/gate evidence,
  not BEAM performance closure.
- Do not count a small live slice, a single retained recall repair, or one
  answer-gap improvement as closure.
- Do not add BEAM expected-answer-specific rules to the answer evidence pack.
- Documentation-only changes require `git diff --check`.
- Future evidence-pack code changes require focused unit tests, `bun run
  typecheck`, and `git diff --check`.
- Future live measured runs require a full 400-case run, a same-profile zero-failure
  recall diagnostic, `executionFailures: 0`, and an accepted closure gate.

Commands
--------

```text
bun test tests/unit/answer-evidence-pack.test.ts tests/unit/run-phase-63.beam-live-slice.test.ts tests/unit/analyze-phase-63-live-answer-gap.test.ts tests/unit/run-phase-63.beam-live-ablation.test.ts --timeout 60000
bun run typecheck
bun run eval:phase-63-recall-diagnostic -- --benchmark-root /private/tmp/BEAM --profile <goodmemory-rules-only|goodmemory-hybrid> --run-id <run-id>
bun run analyze:phase-63-recall-diagnostic -- --report-path <report> --baseline-report-path <baseline> --benchmark-root /private/tmp/BEAM
bun run scripts/analyze-phase-63-live-answer-gap.ts --benchmark-root /private/tmp/BEAM --live-report reports/eval/research/phase-63/beam/run-phase63-beam-100k-live-closure-gpt55-evidence-pack-answer-hardening-current/live-slice-report.json --run-id run-phase63-beam-live-answer-gap-answer-hardening-current
bun run scripts/run-phase-63-beam-live-ablation.ts --benchmark-root /private/tmp/BEAM --live-report <live-slice-report.json> --mode <gold-evidence-only|retrieved-hit-only|retrieved-raw-uncompressed|full-context|gold-evidence-pack|retrieved-evidence-pack> --run-id <run-id>
bun run eval:phase-63-live-closure -- --benchmark-root /private/tmp/BEAM --recall-report <recall-diagnostic.json> --profile <goodmemory-rules-only|goodmemory-hybrid> --run-id <run-id>
bun run gate:phase-63-beam-closure -- --closure-report <phase-63-beam-closure-report.json> --run-id <gate-run-id>
git diff --check
```
