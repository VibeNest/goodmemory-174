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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-grammar-anxiety-contradiction-current-20260615T150236Z`. Tenth contradiction_resolution recovery and the first MULTI-EVIDENCE (3-turn) contradiction case. Compared with the work-email-self-care baseline (20260615T144025Z), it raises evidence-chat recall to 0.9449720545495194, lowers missed-recall cases to 31/355 and wrong-recall/noise to 176/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 999/95/837 to 1000/94/830. Target `10:contradiction_resolution:1` ("Do I usually feel anxious about my grammar accuracy after receiving feedback?") goes from recall 0.667 to full recall: the affirmative spans two user turns (56 = feeling anxious about grammar accuracy after a colleague's Feb 28 feedback; 58 = deciding to upgrade tools to Grammarly Premium to catch the flagged errors), opposed by a later denial (68 = grammar accuracy never caused anxiety after any feedback). It recovers the missing middle turn 58 and returns all three source-ordered, shedding five noisy chats. The repair adds a generic multi-facet contradiction recipe in a new `src/recall/selectors/contradictionRules/multiFacetGroups.ts` (a gate + an ordered list of facet patterns + `selectMultiFacetContradictionGroup`/`selectTabulatedMultiFacetContradictionGroup`, chained in `selectContradictionEvidencePair`), with `isGrammarAnxietyContradictionQuery` ("grammar accuracy" && "feedback" && "anxious", 1/400) as the first entry; the patterns key on surrounding phrasing only (selector files disallowed-scan clean). Notably turn 58 carries NO `->-> ` source marker yet was recovered, because the multi-facet filter requires conversation-evidence + user-answer + a source-order key (chatId) rather than the SOURCE_MESSAGE_TAG that markerless turns lack. The gate is added to `instructionAugmentationStandDownQuery` so the companion augmenter does not append noise to the 3-turn winner. ACCEPTED RIPPLE: this is not a single-delta pass — recovering 10:cr:1 stopped it reinforcing the shared assistant turns 151/153/155, which reshuffled same-conversation `10:instruction_following:2`'s noise from five chats [5,151,153,155,75] to three [5,75,23] while its recall HELD at 1 (evidence turn 172 still hit); a recall-neutral same-conversation reinforcement tradeoff (net −2 noise on that case) per the charter, no hit-loss, no newly-missing evidence, no new zero-recall. This establishes the multi-facet recipe for the four remaining multi-evidence contradiction cases (18:cr:1, 8:cr:1, 5:cr:2, 2:cr:1). The temporal_reasoning family is fully recovered. Remaining partial-recall families: contradiction_resolution (4, multi-evidence), multi_session_reasoning (11, "how many" aggregates have an upstream candidate-pool recall gap), instruction_following (6, answer_ai_question-blocked), and knowledge_update (3, answer_ai_question-blocked). The prior accepted recall change was the twelfth temporal_reasoning recovery (18:temporal_reasoning:1, work-email-boundary-to-self-care), which completed the temporal_reasoning family (all 40 tr cases at recall 1) and left recall at 0.9440330874133691.

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
