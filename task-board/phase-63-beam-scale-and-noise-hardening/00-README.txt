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
- Gate input guard: `gate:phase-63` rejects duplicate `--output-dir` /
  `--run-id`, and `gate:phase-63-beam-closure` rejects duplicate
  `--closure-report` / `--output-dir` / `--run-id` before gate evidence is read
  or written.
- BEAM adapter proof: `run-phase63-beam-100k-full-initial-20260518T000335Z`,
  real 100K export, all four profiles, `executionFailures: 0`.
- External-root prep guard: `prepare:phase-63-beam` rejects duplicate
  `--dataset`, `--github-api-root`, `--github-concurrency`,
  `--github-raw-root`, `--length`, `--offset`, `--output-root`, `--source`,
  and `--split` before fetching rows or writing the BEAM root.
- Latest retained recall diagnostic:
  `run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z`,
  evidence-chat recall 0.9620612564274538, missed 20/355,
  wrong-recall/noise 167/400, zero-recall 0.
- General-lever recall remeasure:
  `eval:phase-63-general-levers` disables registered narrow gates by default
  and measures the BEAM generalization floor, not the fitted retained-recall
  path; use `--keep-gates` only for an explicit fitted-path comparison. The
  runner keeps non-provider `floor` / `bm25` arms embedding-free when provider
  embedding env is present and includes non-default `--semantic-topk` values in
  default union run ids. Output `--run-id` values must be single path segments
  before the wrapper invokes the recall diagnostic.
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
   answer-shape guidance, target-anchor filtering for generic order/action
   words, value-bearing count tables, summary framing,
   multi-session facet framing, instruction standing/latest constraint framing,
   and current-value framing for update/conflict/CR questions that avoids
   yes/no-only contradiction answers. Local pre-live instruction cue hardening
   now also surfaces concrete date values plus date/format requirements instead
   of treating date-format tokens as named tools, and contradiction cue
   hardening now leads with the affirmative side before the denial side.
   Preference-following pre-live hardening now also emits explicit response
   requirements for lightweight/minimal-dependency, automation, step-by-step,
   direct-link, morning, and practical/logical constraints, and
   information-extraction coverage cues now preserve source-backed fields,
   deadlines, preparation steps, and required sub-items while avoiding
   unrequested identifiers. The
   latest hard-slice was
   10/12 and the
   full run improved to 278/400, but this is still not performance closure.
5. Revisit instruction_following 27 through noise budgeting because the latest
   analyzer still shows full-recall-noisy failures after the instruction
   constraint framing.
6. Return to recall selection only for missing-evidence families.
7. Validate answer-time gains against Phase 64 MemoryAgentBench CR before
   treating any BEAM gain as general.
8. Keep missing-context abstention wording topic-specific in focused live
   prompts, and keep it ASCII-only so prompt text remains stable across local
   tooling and logs.
9. Keep base `eval:phase-63` selectors strict: scalar source/output/run flags
   such as `--benchmark-root`, `--limit`, `--mode`, `--offset`, `--output-dir`,
   `--run-id`, and `--scale` must stay single-valued before smoke/full report
   generation, while `--case-id`, `--profile`, and `--question-type` remain
   repeatable. Output `--run-id` values must also be a single path segment
   before deriving smoke/full report directories.
10. Keep focused live-slice selectors strict: repeated `--answer-gap-bucket`,
   `--answer-gap-source-coverage-status`, and `--case-id` values must be
   present, unique, canonical, and validated before reading answer-gap or
   benchmark files. Live-slice and live-closure scalar source/output flags such
   as `--recall-report`, `--run-id`, `--output-dir`, `--profile`, and
   `--benchmark-root` must also stay single-valued before report generation,
   and `--run-id` must be a single path segment so live evidence directories
   stay under the intended output tree. New focused live-slice reports should
   persist optional `selection` metadata for explicit case ids, case-selection
   mode, recall report path, answer-gap report path, answer-gap buckets,
   source-coverage filters, and limit so answer-gap slice evidence is auditable
   without relying on run-id naming conventions.
11. Keep recall diagnostic source/report selectors strict: diagnostic scalar
   flags such as `--benchmark-root`, `--limit`, `--output-dir`, `--run-id`, and
   `--scale` must stay single-valued while diagnostic `--profile` remains
   repeatable, and output `--run-id` must be a single path segment; analyzer
   scalar flags such as `--report-path`,
   `--baseline-report-path`, `--benchmark-root`, `--output-path`, `--run-id`,
   `--baseline-run-id`, and `--source-turn-limit` must fail fast when
   duplicated. Analyzer `--run-id` and `--baseline-run-id` values must be single
   path segments before default report paths are resolved. Analyzer output paths
   must also stay distinct from both the analyzed report and baseline report
   before any input is read, and distinct from any candidate BEAM source file
   under `--benchmark-root` before benchmark source rows are read.
12. Keep the initial BEAM report analyzer inputs single-valued and output
    distinct from its source report: `analyze:phase-63-beam` must reject
    duplicate `--report-path`, `--output-path`, and `--run-id` selectors before
    reading inputs, must require `--run-id` to be a single path segment before
    resolving the default source report path, and must reject an output path that
    resolves to `--report-path` before reading the source report.
13. Keep answer-gap and ablation output reports distinct from source live
    reports: `scripts/analyze-phase-63-live-answer-gap.ts` and
    `scripts/run-phase-63-beam-live-ablation.ts` must reject any output report
    path that resolves to `--live-report` before reading benchmark or live
    sources. The answer-gap analyzer must also reject an explicit output path
    that resolves to a candidate BEAM source file under `--benchmark-root`.
14. Keep answer-gap and ablation derived output directories canonical: output
    `--run-id` must be a single path segment before either tool derives its
    default output path from `--output-dir` plus `--run-id`.
15. Keep BEAM env-derived source roots canonical: `GOODMEMORY_BEAM_ROOT` must
    not be empty or whitespace-padded before root-prep, smoke/full, recall
    diagnostic, live-slice, live-closure, answer-gap, or ablation evidence uses
    it as the `--output-root` or `--benchmark-root` fallback. Explicit CLI roots
    keep precedence.

Acceptance Checks
-----------------

- Documentation remains clear that the 0.695 run is pipeline/gate evidence,
  not BEAM performance closure.
- Do not count a small live slice, a single retained recall repair, or one
  answer-gap improvement as closure.
- Do not add BEAM expected-answer-specific rules to the answer evidence pack.
- Current-value ledgers should not let a later sibling entity's metric replace
  the target entity's latest value.
- Instruction concrete answer-content cues should not list companion openers
  such as `Also` or `Additionally` as named tools/examples.
- Contradiction answer packs should preserve both sides of same-turn
  strong-denial contradictions, including `did not` / `didn't` clauses.
- Count ledgers should preserve compound word-number quantities such as
  `twenty-one survey responses` instead of extracting only the trailing word.
- Focused live-slice selector typos must fail fast instead of matching no cases
  or the wrong answer-gap queue.
- Duplicate live-slice / live-closure scalar source and output flags must fail
  fast before report generation.
- Focused live-slice reports should preserve the answer-gap / case-selection
  inputs that selected their cases.
- Closure gate reports must reject inconsistent closure summaries, including
  `profilesCompared` values that do not contain exactly the closure `profile`,
  `correctCases + wrongAnswerCases != totalCases`, and `answerAccuracy` values
  that do not equal `correctCases / totalCases`.
- Answer-gap analyzer and ablation output report paths must fail fast when they
  would overwrite the input live report, and answer-gap output paths must also
  fail fast before overwriting a benchmark source file under `--benchmark-root`.
- Answer-gap analyzer and ablation output `--run-id` values must fail fast when
  they are not single path segments.
- Documentation-only changes require `git diff --check`.
- Future evidence-pack code changes require focused unit tests, `bun run
  typecheck`, and `git diff --check`.
- Answer-gap analyzer and ablation CLI changes require focused parser coverage
  in `tests/unit/analyze-phase-63-live-answer-gap.test.ts` and
  `tests/unit/run-phase-63.beam-live-ablation.test.ts`.
- Recall diagnostic runner and analyzer CLI changes require focused parser
  coverage in `tests/unit/run-phase-63.beam-recall-diagnostic.test.ts` and
  `tests/unit/analyze-phase-63-recall-diagnostic.test.ts`.
- Recall diagnostic analyzer output report paths must fail fast when they would
  overwrite either source recall report.
- Recall diagnostic and general-lever output `--run-id` values must fail fast
  when they are not single path segments.
- Initial BEAM report analyzer duplicate scalar selectors and output paths that
  would overwrite the source report must fail fast before reading inputs.
- Future live measured runs require a full 400-case run, a same-profile zero-failure
  recall diagnostic, `executionFailures: 0`, and an accepted closure gate.

Commands
--------

```text
bun test tests/unit/answer-evidence-pack.test.ts tests/unit/run-phase-63.beam-live-slice.test.ts tests/unit/analyze-phase-63-live-answer-gap.test.ts tests/unit/run-phase-63.beam-live-ablation.test.ts --timeout 60000
bun run typecheck
bun run eval:phase-63-recall-diagnostic -- --benchmark-root /private/tmp/BEAM --profile <goodmemory-rules-only|goodmemory-hybrid> --run-id <run-id>
bun run eval:phase-63-general-levers -- --benchmark-root /private/tmp/BEAM --arm <floor|bm25|union16|bm25-union16> --output-dir <reports-dir> --run-id <run-id>
bun run analyze:phase-63-recall-diagnostic -- --report-path <report> --baseline-report-path <baseline> --benchmark-root /private/tmp/BEAM
bun run scripts/analyze-phase-63-live-answer-gap.ts --benchmark-root /private/tmp/BEAM --live-report reports/eval/research/phase-63/beam/run-phase63-beam-100k-live-closure-gpt55-evidence-pack-answer-hardening-current/live-slice-report.json --run-id run-phase63-beam-live-answer-gap-answer-hardening-current
bun run scripts/run-phase-63-beam-live-ablation.ts --benchmark-root /private/tmp/BEAM --live-report <live-slice-report.json> --mode <gold-evidence-only|retrieved-hit-only|retrieved-raw-uncompressed|full-context|gold-evidence-pack|retrieved-evidence-pack> --run-id <run-id>
bun run eval:phase-63-live-closure -- --benchmark-root /private/tmp/BEAM --recall-report <recall-diagnostic.json> --profile <goodmemory-rules-only|goodmemory-hybrid> --run-id <run-id>
bun run gate:phase-63-beam-closure -- --closure-report <phase-63-beam-closure-report.json> --run-id <gate-run-id>
git diff --check
```
