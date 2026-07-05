Phase 64 Breakdown: MemoryAgentBench Agent-Memory Hardening
===========================================================

Status
------

[CLOSED — INTERNAL EVIDENCE; P67-C PUBLIC CLAIM SUPERSEDES THE README BOUNDARY]
Phase 64 is closed as the accepted zero-failure AR+CR live closure (CR 0.959,
AR 0.67, executionFailures 0) plus the TTL/LRU answer-format boundary. At Phase
64 closure this was internal small-slice evidence, not a public claim; P67-C
later promoted only CR 0.959 / TTL 0.767 through
`benchmark-claims/memoryagentbench.json`, with AR/LRU excluded. Phase 63 BEAM
remains paused (rules-only retrieval recall 0.9621). Current active lane:
v0.3 release readiness / public-surface hardening (Phase 66).

Progress: P64-T001/T002 done (source intake + synthetic smoke contract). P64-T003
done: external-root adapter + retrieval-only smoke report
(scripts/run-phase-64-memory-agent-bench-smoke.ts, eval:phase-64-smoke). P64-T004
done: the report emits per-competency evidence recall, noise, stale, and TTL
action-policy readiness; first run recorded (executionFailures 0, evidence recall
1.0 across AR/TTL/LRU/CR). P64-T005 (DONE — accepted zero-failure AR+CR live
closure + TTL/LRU answer-format boundary): investigation showed the "CR
stale-selection" is NOT a retrieval bug (GoodMemory keeps value history
retrievable on purpose; explicit-over-explicit supersession would regress BEAM
knowledge_update) — conflict resolution is decided at ANSWER time. Added a
deterministic live-answer scaffold (injectable answerGenerator, answer scored via
match modes, mode retrieval-only|live-answer, per-competency answerAccuracy);
additive only, zero BEAM blast radius. The real model path now exists behind
`--live`, and can be paired with `--evidence-pack`; synthetic live evidence
`run-phase64-mab-synthetic-live-pack` exposed a reasoning-wrapper false negative
in LRU scoring, so scoring strips recognized `<think>` wrappers before matching
while preserving the raw generated answer. First external-root rules smoke is now
recorded: /private/tmp/MAB/cases.json was prepared from upstream Hugging Face
rows (eventqa_full, icl_banking77, detective_qa, factconsolidation_sh_6k), and
the corrected run `run-phase64-mab-external-rules-ar-normalized-current`
completed with executionFailures 0. The larger slice exposed real retrieval
pressure before any LLM call: AR 0.6, TTL 0.3889, LRU 0.6667, and CR 1.0 with
all stale history co-retrieved. First generic repair narrowed English open-loop
query routing for support/instruction questions; rerun
`run-phase64-mab-external-rules-open-loop-support-guard-current` improved TTL
from 0.3889 to 0.4444 and reduced TTL noise from 10 to 9, while AR/LRU/CR stayed
unchanged. TTL action-policy readiness is still false, so the next step remains
rules-only miss tracing or a bounded external-root live-answer slice, not a
claim of full closure. The report contract now also includes per-question
`missingEvidenceChunkIds` and `noiseChunkIds`; the latest
external rerun `run-phase64-mab-external-rules-missing-noise-ids-current` keeps
the same aggregate metrics while making the remaining misses directly visible.


Why Phase 64 Needs Prep
-----------------------

MemoryAgentBench stresses agent memory through incremental multi-turn
interactions. Its four public competency buckets map directly onto GoodMemory
mechanisms:

- Accurate Retrieval: retrieve the right state-changing evidence.
- Test-Time Learning: turn feedback or examples into later behavior.
- Long-Range Understanding: preserve trajectory state across long interaction
  spans.
- Conflict Resolution: prefer current facts over stale or contradicted facts.

The Phase 63 BEAM work already showed that a recall lift alone is not enough.
The next benchmark will punish stale selection, noisy context, and learned-rule
misapplication more directly than BEAM's oracle-answer diagnostic.


Preparation Rules
-----------------

- Keep MemoryAgentBench data outside the repository.
- Prefer a small synthetic smoke fixture before any full upstream run.
- Carry Phase 63 noise and knowledge_update risks into the first Phase 64 gate.
- Require changed-case comparisons before keeping any selector repair.
- Do not add dataset-specific keyword branches as the first response to misses.
- `prepare:phase-64-mab` rejects duplicate `--merge` and duplicate scalar
  source/output/budget selectors before external-root writes; this is fixture-prep
  integrity only, not a new score or claim.
- `eval:phase-64-smoke` rejects duplicate mode switches and scalar source/output
  selectors before report generation, and requires `--limit` to be a canonical
  positive integer string; `--run-id` must also be a single path segment so
  smoke/live evidence directories stay under the intended output tree. This
  protects smoke/live evidence inputs only, not the accepted closure score or
  P67-C public claim.
- `analyze:phase-64-readiness` rejects duplicate scalar source/output selectors
  (`--phase63-analysis-path`, `--output-dir`, `--output-path`, `--run-id`) before
  reading Phase 63 analysis or writing prep evidence, and requires `--run-id` to
  be a single path segment before deriving the default output path; this is
  prep-report input and output-directory integrity only.
- `GOODMEMORY_MAB_ROOT` must not be empty or whitespace-padded before
  `prepare:phase-64-mab` or `eval:phase-64-smoke` uses it as an output-root or
  benchmark-root fallback. Explicit CLI roots still take precedence, and
  synthetic smoke still runs without an external root. This protects
  fixture-prep, retrieval, and live evidence provenance only, not the accepted
  closure score or P67-C public claim.


Readiness Analyzer
------------------

`scripts/analyze-phase-64-readiness.ts` consumes a Phase 63
`recall-diagnostic-analysis.json` file and writes a Phase 64 preparation report.
It rejects duplicate scalar source/output selectors and rejects an output path
that resolves to the input `--phase63-analysis-path` before reading the Phase 63
analysis, and requires `--run-id` to be a single path segment before deriving the
default output path, so the derived prep report cannot use ambiguous CLI inputs,
escape the intended output tree, or overwrite the source diagnostic analysis.
The report groups residual Phase 63 risk into:

- `conflict_update_resolution`
- `noise_budgeting`
- `behavior_policy_learning`
- `long_horizon_task_memory`

Example:

```text
bun run analyze:phase-64-readiness -- \
  --phase63-analysis-path reports/eval/research/phase-63/beam/<run-id>/recall-diagnostic-analysis.json
```

The output defaults to:

```text
reports/eval/research/phase-64/memoryagentbench-prep/<run-id>/phase-64-readiness.json
```


First Adapter Requirements
--------------------------

During Phase 64 bring-up, the first adapter was required to report these fields
from the smoke run:

- `phase`, `benchmark`, `mode`, `runId`, `generatedAt`
- upstream source, license, and external root
- profiles compared
- competency bucket per case: AR, TTL, LRU, or CR
- answer/task metric used by upstream
- evidence recall and retrieved evidence ids when available
- stale/superseded evidence count
- noise evidence count
- action-policy transfer verdict for TTL cases
- execution failures


Initial Smoke Fixture Shape
---------------------------

The synthetic fixture should cover one small case per competency:

- AR: later question asks for a directly stated event or fact.
- TTL: user teaches a label/rule and a later task requires applying it.
- LRU: later question requires joining distant trajectory events.
- CR: old fact is updated, and the final answer must use the current value.


Effect-Improvement Priority
---------------------------

The first Phase 64 improvement loop should use this order:

1. CR / knowledge-update correctness: prevent stale facts from beating current
   facts.
2. TTL behavior transfer: ensure feedback becomes action, not just recall text.
3. Noise budget: cap irrelevant retrieved state without losing required
   evidence.
4. LRU trajectory state: retrieve minimal ordered state-changing events.

This order comes from the current Phase 63 evidence: broad recall additions
improved some buckets but left wrong/noise high and regressed knowledge_update.


First External-Root Rules Smoke
-------------------------------

Prepared an external normalized root at `/private/tmp/MAB/cases.json` from
upstream Hugging Face rows, without vendoring data into the repo:

- AR: `eventqa_full`, 5 EventQA event-chain questions.
- TTL: `icl_banking77_5900shot_balance`, 6 few-shot label questions.
- LRU: `detective_qa`, 6 keypoint-backed questions.
- CR: `factconsolidation_sh_6k`, 8 conflict-resolution fact questions.

The first run (`run-phase64-mab-external-rules-current`) is superseded for AR:
it exposed a normalization bug where EventQA questions used the first row
questions but the generated evidence chunks came from a later `previous_events`
window. Its AR recall 0.0 is not a valid product signal. The corrected
external-root file now builds AR chunks from the initial event plus the first
five gold next-events.

Command:

```text
bun run eval:phase-64-smoke -- --benchmark-root /private/tmp/MAB --run-id run-phase64-mab-external-rules-ar-normalized-current
```

Result:

- executionFailures: 0
- AR: averageEvidenceRecall 0.6, fullyRetrieved 3/5, noise 9
- TTL: averageEvidenceRecall 0.3889, fullyRetrieved 1/6, noise 10,
  actionPolicyTransferReady false
- LRU: averageEvidenceRecall 0.6667, fullyRetrieved 4/6, noise 18
- CR: averageEvidenceRecall 1.0, fullyRetrieved 8/8, noise 20,
  staleSelectedCount 8

Reading:

- The external-root slice is meaningfully harder than the synthetic smoke and
  should be used before any wider live-answer LLM run or closure claim.
- CR confirms the current framing: current facts are retrievable, but stale
  history is co-retrieved, so conflict resolution belongs at answer time rather
  than explicit-over-explicit supersession.
- TTL and LRU now have partial retrieval/noise deltas worth analyzing.
- Corrected AR still has two rules-only misses. Candidate tracing showed the
  facts were written correctly; the misses are generic lexical/ranking pressure
  from long option-list questions where gold options appear verbatim but token
  overlap is diluted and already-occurred events can outrank the next event.
  Do not add an EventQA-specific option parser as the first fix.

Report (gitignored research evidence):
reports/eval/research/phase-64/mab/run-phase64-mab-external-rules-ar-normalized-current/smoke-report.json


First Generic Repair
--------------------

Change:

- Narrowed English open-loop query routing so support/instruction questions like
  `I got a message that I need to verify my identity; what do I do?` no longer
  request the `open_loop` slot.
- Kept explicit open-loop/todo/handoff/signoff wording and personal pickup/return
  count queries routed as open-loop queries.

Validation:

```text
bun test tests/unit/language/service.test.ts tests/unit/recall.router.test.ts
bun test tests/unit/run-phase-64.memory-agent-bench-smoke.test.ts
bun run eval:phase-64-smoke -- --benchmark-root /private/tmp/MAB --run-id run-phase64-mab-external-rules-open-loop-support-guard-current
```

Result:

- executionFailures: 0
- AR: averageEvidenceRecall 0.6, fullyRetrieved 3/5, noise 9
- TTL: averageEvidenceRecall 0.4444, fullyRetrieved 1/6, noise 9,
  actionPolicyTransferReady false
- LRU: averageEvidenceRecall 0.6667, fullyRetrieved 4/6, noise 18
- CR: averageEvidenceRecall 1.0, fullyRetrieved 8/8, noise 20,
  staleSelectedCount 8

Delta vs corrected baseline:

- TTL improved from 0.3889 to 0.4444 and noise dropped from 10 to 9.
- The changed TTL case `icl_banking77_5900shot_balance_no3` moved from 1/3 gold
  evidence with 2 noise chunks to 2/3 gold evidence with 1 noise chunk.
- AR and LRU misses remain generic lexical/ranking pressure; CR still needs
  answer-time resolution rather than retrieval-time explicit-over-explicit
  supersession.
- Because TTL `actionPolicyTransferReady` is still false, do not treat a small
  live-answer run as external-root closure until the remaining TTL
  semantic/label-transfer misses are traced or explicitly bounded.

BEAM safety spot-check:

```text
bun run eval:phase-63-recall-diagnostic -- --benchmark-root /private/tmp/BEAM --profile goodmemory-rules-only --scale 100K --run-id run-phase63-beam-100k-recall-diagnostic-rules-open-loop-guard-spotcheck-20260616T000000Z
bun run analyze:phase-63-recall-diagnostic -- --report-path reports/eval/research/phase-63/beam/run-phase63-beam-100k-recall-diagnostic-rules-open-loop-guard-spotcheck-20260616T000000Z/recall-diagnostic.json --baseline-report-path reports/eval/research/phase-63/beam/run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z/recall-diagnostic.json --benchmark-root /private/tmp/BEAM
```

Result:

- caseDeltaCount: 0
- every bucket delta: 0
- evidence-chat recall stayed 0.9620612564274538
- missed stayed 20/355, zero-recall stayed 0, wrongRecall stayed 167/400
- global hit/missing/noise ids stayed 1023/71/807

Conclusion: the English open-loop support-question guard has no measurable BEAM
100K rules-only regression.

Report (gitignored research evidence):
reports/eval/research/phase-64/mab/run-phase64-mab-external-rules-open-loop-support-guard-current/smoke-report.json


Missing/Noise Id Contract
-------------------------

Change:

- `scoreMemoryAgentBenchRetrieval` now includes `missingEvidenceChunkIds` and
  `noiseChunkIds` on every per-question report entry.
- This is additive report instrumentation only; it does not change recall
  selection or benchmark scoring.

Validation:

```text
bun test tests/unit/run-phase-64.memory-agent-bench-smoke.test.ts
bun run eval:phase-64-smoke -- --benchmark-root /private/tmp/MAB --run-id run-phase64-mab-external-rules-missing-noise-ids-current
```

Result:

- executionFailures: 0
- aggregate metrics unchanged from the open-loop-support-guard run:
  AR 0.6, TTL 0.4444, LRU 0.6667, CR 1.0
- TTL remaining misses:
  - `icl_banking77_5900shot_balance_no1`: missing [5,6], retrieved [4]
  - `icl_banking77_5900shot_balance_no2`: missing [7,8,9], noise [14,4,21,1]
  - `icl_banking77_5900shot_balance_no3`: missing [10], noise [14]
  - `icl_banking77_5900shot_balance_no4`: missing [13,15], noise [34]
  - `icl_banking77_5900shot_balance_no5`: missing [17,18], noise [27]
- LRU remaining misses:
  - `detective_qa_book124_no0`: missing [1], noise [2,3,6,4]
  - `detective_qa_book124_no5`: missing [6], noise [2,3,5,4]

Rejected exploratory repairs:

- Adding `source_order` tags to all external chunks reduced LRU, so it should not
  be kept as an adapter fix.
- Rewriting TTL no2's `withdrawl` typo to `withdrawal` did not improve the miss;
  it only changed which withdrawal-related noise was selected.

Reading:

- TTL is now mostly semantic/label-transfer pressure, not a simple route bug.
- LRU is generic ranking/limit pressure, with answer-relevant non-gold chunks
  sometimes retrieved; do not add benchmark-specific option parsing.
- Next credible choices are semantic/hybrid retrieval for TTL label transfer or
  a small external-root live-answer slice after the scoring-wrapper fix, not more
  lexical one-off rules.

Report (gitignored research evidence):
reports/eval/research/phase-64/mab/run-phase64-mab-external-rules-missing-noise-ids-current/smoke-report.json
