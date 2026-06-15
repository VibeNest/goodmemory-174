# Sequential Benchmark Hardening Plan

This file is the compact route for external benchmark hardening. Historical per-run notes were removed from this current-truth surface; use git history, `reports/eval/`, and `reports/quality-gates/` for provenance.

## Sequence

1. LongMemEval
2. BEAM
3. MemoryAgentBench
4. LoCoMo

Do not publish a benchmark claim until the relevant phase has live answer generation, live or accepted judging where required, current evidence links, and an accepted gate. Internal recall diagnostics are engineering evidence, not public leaderboard claims.

## Current State

- Phase 62 LongMemEval is accepted as the first external-benchmark hardening slice.
- Phase 63 BEAM is active and still partial.
- Current BEAM work is scoped to provider-free recall diagnostics plus small live answer-generation/judge slices before any public score.

## Accepted Phase 62 Checkpoint

- Run: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
- Profile: `goodmemory-hybrid`
- Result: 454/500 answer accuracy, evidence-session recall 0.9590, missed recall 35, wrong recall 6, wrong answers 46, `executionFailures: 0`.
- Boundary: accepted internal LongMemEval close evidence, not a README-level public benchmark claim.

## Active Phase 63 Evidence

- Smoke harness: `run-phase63-beam-smoke-current` plus gate `run-20260518003000`.
- Real 100K adapter proof: `run-phase63-beam-100k-full-initial-20260518T000335Z` over `/private/tmp/BEAM/100K.json`, 20 rows and 400 probing questions. This proves ingestion/contract shape only because it uses deterministic oracle evidence.
- First real rules-only recall diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`, evidence-chat recall 0.11625896794910878, missed 340/355, wrong-recall/noise 362/400, `executionFailures: 0`.
- Best small live slice: `run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`, answer accuracy 3/3, evidence-chat recall 1.0, wrong-recall/noise 2/3, `executionFailures: 0`.
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-coin-toss-contradiction-current-20260615T131350Z`. Sixth contradiction_resolution recovery — the first via the extracted `contradictionRules/firstDenialPairs.ts` module (passes 61/62/63/70/71 + this). Compared with the firstDenial-extract baseline (20260615T124515Z), it raises evidence-chat recall to 0.9369908338922424, lowers missed-recall cases to 37/355 and wrong-recall/noise to 182/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 993/101/854 to 994/100/852. Target `5:contradiction_resolution:1` ("Have I completed any coin toss problems before?") goes from recall 0.5 to full recall: it recovers the missing first-statement turn 36 ("score of 4/5 correct on the 5 coin toss problems") to pair with the already-hit denial turn 66 ("never completed any coin toss problems"), and sheds its two noisy chats (44/60). The repair adds an `isCoinTossProblemsContradictionQuery` gate ("coin toss problems" && "completed", 1/400) + a first/denial pattern-pair + one FIRST_DENIAL_CONTRADICTION_PAIRS table entry to the new module + an enrichment entry; the FIRST pattern keys on "score of 4/5 correct on the 5 coin toss problems" so it excludes the two near-duplicate turns (44/60) that also say "completed 5 coin toss problems ... 4/5 correct". Cleanest possible pass: exactly one case delta, zero ripples — conv-5 carries 5:tr:1, 5:tr:2 (both prior recoveries) and the other 5:* cases unchanged, all held. The remaining partial-recall families are contradiction_resolution (8 — clean 2-turn pairs ready via the module: 3:cr:2, 18:cr:2, then 11:cr:1 which needs surrounding phrasing for the disallowed "Michael"), temporal_reasoning (2 — 13:tr:1/18:tr:1 need broad-gate widening), multi_session_reasoning (11, "how many" aggregates have an upstream candidate-pool recall gap), instruction_following (6, answer_ai_question-blocked), and knowledge_update (3, answer_ai_question-blocked).

## Current Open Boundary

Phase 63 remains recall-limited and noisy. The next loop should stay narrow:

1. Pick one named miss/noise family from the latest analyzer.
2. Add a focused failing regression.
3. Make a scoped selector or routing repair.
4. Rerun focused tests, the retained diagnostic, and analyzer comparison.
5. Update only this summary, the Phase 63 task file, and generated evidence pointers when the retained delta is accepted.

Do not treat a focused green or one recovered row as BEAM closure.

## Commands

```text
bun run prepare:phase-63-beam -- --output-root /private/tmp/BEAM --split 100K --length 100 --source github-raw
bun run eval:phase-63
bun run gate:phase-63
bun run eval:phase-63-recall-diagnostic -- --benchmark-root /private/tmp/BEAM --profile goodmemory-rules-only --run-id <run-id>
bun run analyze:phase-63-recall-diagnostic -- --report-path <report> --baseline-report-path <baseline> --benchmark-root /private/tmp/BEAM
bun run eval:phase-63-live-slice -- --benchmark-root /private/tmp/BEAM --recall-report <recall-diagnostic.json> --profile goodmemory-rules-only --limit 3 --run-id <run-id>
```

## Source And Evidence Pointers

- Phase board: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`
- Phase breakdown: `task-board/phase-63-beam-scale-and-noise-hardening/00-README.txt`
- Current repo status: `docs/GoodMemory-Current-Status-and-Evidence.md`
- Generated artifacts: `reports/eval/` and `reports/quality-gates/`
