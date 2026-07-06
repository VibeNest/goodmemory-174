Phase 65 Breakdown: LoCoMo Very-Long-Term Conversational-Memory Hardening
========================================================================

Status
------

[ACTIVE, PARTIAL] Phase 65 LoCoMo is the fourth leg of the Sequential Benchmark
Hardening Plan and the last in the sequence (LongMemEval -> BEAM ->
MemoryAgentBench -> LoCoMo). Bring-up T001-T004 is complete; the external-root
live-answer/category path, candidate-admission probes, answer-policy slices, and
manifest-driven reanswer tooling are now banked as internal hardening evidence.
The separate P4 full-10 opt-in union/extraction profile is publicly claimable
through `benchmark-claims/locomo.json` and is README-promoted, but this active
Phase 65 lane remains open for default-profile promotion and broader
category-quality hardening.

Current active work is targeted candidate admission plus multi_hop/noise
answer-policy repair. Phase 63 / P67-D BEAM is publicly claimable on the official-protocol track, while its internal binary answer-gap workstream remains open, and Phase 64 MemoryAgentBench is closed for the scoped public CR/TTL claim.


What LoCoMo Is
--------------

snap-research/locomo (arXiv:2402.17753). Ten very-long-term multi-session
conversations between two speakers (avg ~300 turns / ~9K tokens, up to 35
sessions). data/locomo10.json. Each conversation object has top-level keys "qa"
and "conversation".

- A dialog turn: {"speaker": "Caroline", "dia_id": "D1:1", "text": "..."}. The
  dia_id format is "D<session_number>:<turn_number>"; the recall diagnostic keys
  on it.
- A QA sample: {"question", "answer", "evidence": ["D1:3", ...], "category": N}.
  "evidence" is the list of dia_ids carrying the gold answer (may be empty for an
  unanswerable adversarial probe). Adversarial (category 5) samples add
  "adversarial_answer": the tempting wrong answer.
- Category integer codes (verified): 1 multi-hop, 2 temporal, 3 open-domain,
  4 single-hop, 5 adversarial.
- Primary QA metric: token-level F1; adversarial scored on resisting the
  tempting answer.
- License: CC BY-NC 4.0 (non-commercial) -> no vendoring of upstream data.


Seam (mirrors Phase 63 BEAM / Phase 64 MemoryAgentBench)
--------------------------------------------------------

createLocomoSmokeMemory(): in-memory storage, hash embedding adapter,
deterministic createId/now. seedLocomoCase(): force every turn as a retrievable
fact (remember "always", confirmed + verified, extractionStrategy "rules-only",
content prefix "[LOCOMO dia_id=D1:3 speaker=...] <text>", attributes.diaId, tags
["locomo","dia_id:D1:3"], role forced "user" so rules-only extraction keeps every
turn). collectLocomoRetrievedTurnIds(): scan recall sections for
dia_id[:=]D\d+:\d+ in content/tags/attributes. scoreLocomoRetrieval(): evidence
recall / missing / noise per question. summarizeLocomoRetrieval(): per-category
recall, noise, multi_hop cross-session-chain readiness (the analog of Phase 64's
TTL action-policy-transfer readiness), and answerAccuracy (null until a live
generator is supplied).


Contract Decisions
------------------

- Turn ids are STRINGS (dia_id), unlike MemoryAgentBench's integer chunk ids.
- Answer metric is token-level F1 (LoCoMo's primary metric), implemented
  SQuAD-style (NFKC, lowercase, drop punctuation and leading articles a/an/the,
  multiset overlap). scoreLocomoAnswer() returns a boolean via a deterministic
  pass threshold (LOCOMO_F1_PASS_THRESHOLD = 0.5) so the smoke can gate pass/fail
  like Phase 64; the raw continuous F1 stays available via locomoTokenF1() for a
  later live mode that prefers to report mean F1.
- Adversarial uses a dedicated "adversarial_abstention" mode: an answer passes
  only when it both matches the gold (correct) answer AND does NOT match the
  tempting adversarial_answer.
- normalizeLocomoCategoryCode() records the upstream integer -> normalized name
  mapping in one auditable place; external normalization (raw locomo10.json ->
  cases.json) applies it outside the repo.


First Synthetic Smoke
---------------------

run-phase65-locomo-smoke-current, executionFailures 0, deterministic. Evidence
recall 1.0 and gold fully retrieved for all five categories. Noise per category:
single_hop 1, multi_hop 0, temporal 0, open_domain 1, adversarial 1. multi_hop
crossSessionChainReady true. The synthetic cases are tiny, so this proves the
ingestion/contract/recall pipeline only; real retrieval pressure (and the first
real misses) await external-root data and the live answer layer.


Next
----

- Continue from the current full-root category matrix and gap analysis. The
  open work is category quality, missing-evidence repair, and noisy full-recall
  answer-policy repair, not adapter bring-up.
- Use the current candidate-admission manifests and reanswer job queues for
  focused repair: validate source-report lineage, isolate one bucket/category at
  a time, rerun the paired live/reanswer comparison, and record answer changes
  with the live-delta tooling.
- Category-filtered replay strictness is now banked in P65-T004gwb:
  `eval:phase-65-reanswer-report` rejects selected source-report rows whose
  actual QA category falls outside the requested `--reanswer-job-category`
  filter. Future repair work can rely on those manifests as isolated
  category-specific queues instead of re-proving this guard.
- Answer-policy manifests are now bucket-aware for current runs:
  `baselineCorrectHighNoise`, `wrongFullRecallNoisy`, and
  `wrongMissingEvidence` can be selected through `--reanswer-job-bucket` while
  legacy bucketless answer-policy manifests remain category-filterable. Use
  `analyze:phase-65-locomo-answer-policy-slice -- --existing-slice <path>` to
  upgrade already-selected legacy slices without re-reading legacy source
  reports that predate current answer-context lineage requirements.
- Before launching manifest-driven reanswer replay, run
  `analyze:phase-65-locomo-reanswer-readiness -- --manifest <path>`. The legacy
  audit over `locomo-cross-category-answer-policy-slice-current` correctly
  reports 9/9 replay jobs blocked because the old single_hop, multi_hop, and
  temporal source reports predate required `answerContextMode` lineage. The
  refreshed path is now the current replay source: the three source refreshes
  completed with 45/45 answered, 19/45 correct, and `executionFailures: 0`;
  `locomo-cross-category-answer-policy-reanswer-readiness-current-slice-refresh-current`
  selected 40 rows across 9 bucket/category jobs; and
  `locomo-cross-category-answer-policy-reanswer-readiness-after-source-refresh-current`
  reports 9/9 ready, 0 blocked, with explicit-id replay commands and ready
  live-answer/provider-embedding env preflight. The regenerated replay reports
  cover 40/40 rows, score 15/40 with `executionFailures: 0`, and their deltas
  are net 0 versus the refreshed source subsets (2 improvements, 2 regressions,
  13 same-correct, 23 same-wrong, 7 token-F1 near misses). Use that refreshed
  slice/readiness pair for follow-up bucket/category replay; treat missing-
  evidence buckets as still open quality work.
- Treat open_domain commonsense/strict-no-evidence probes as opt-in evidence
  until broader category validation proves they do not regress single_hop,
  multi_hop, temporal, or adversarial slices.
- Evidence-pack category routing and multi_hop synthesis prompt hardening are
  banked in P65-T004gwa/P65-T004gwc/P65-T004gwd: LoCoMo `multi_hop` contexts use
  the shared `multi_session_reasoning` framing, `adversarial` contexts use the
  shared `abstention` framing, and category-scoped multi_hop prompts now ask for
  the final synthesized answer rather than the first matching clue. The focused
  three-row noisy-full-recall replay retained the existing 1/3 narrow win, and
  the two remaining synthesis near-misses are classified as balanced
  partial-overlap full-recall candidate rows; default retrieval still retrieves
  0/2. The direct two-row normal-context replay
  `locomo-multihop-full-recall-balanced-near-miss-reanswer-current` and
  gold-evidence-only replay
  `locomo-multihop-full-recall-balanced-near-miss-reanswer-gold-only-current`
  both scored 0/2 with full evidence recall and `executionFailures: 0`; delta
  `locomo-multihop-full-recall-balanced-normal-vs-gold-only-delta-current`
  shows no improvements or regressions, and the follow-up label artifact keeps
  both rows in balanced partial-overlap full-recall near misses. Its row-level
  `goldEvidenceSupport` exact-token diagnostic shows partial declared-evidence
  support, not full support: `conv-48:q83` support recall 0.636 and `conv-49:q29`
  support recall 0.583. Treat this as source-support / answer-synthesis /
  label-compatibility queue evidence, not default promotion.
- For open_domain full-recall wrong rows, treat gold-evidence-only replay as a
  diagnostic, not a fix: the current 13-row strict source scored 3/13, normal
  reanswer fell to 1/13, and gold-evidence-only rose only to 4/13 with one
  regression. The residual 4 token-F1 near misses are now classified as 3
  rationale-bearing gold-answer rows, 0 under-specified, 0
  numeric/frequency-format, and 1 balanced partial-overlap; the analyzer keeps
  short answers whose tokens are a subset of a longer rationale-bearing gold
  answer, including appositive or parenthetical explanatory gold answers, in a
  separate label-compatibility bucket. The near-miss artifact now emits full-recall
  `repairJobs` for the 3-row rationale-bearing bucket and the
  1-row balanced bucket, and `eval:phase-65-smoke` can filter those jobs by
  `--repair-job-diagnosis` and `--repair-job-retrieval-bucket`. Its
  `goldEvidenceSupport` diagnostic averages 0.2352272727 declared-evidence
  support recall across those 4 rows, with 0 full-support, 3 partial-support,
  and 1 zero-support row, so the residual queue is not prompt-only. The
  near-miss artifact's `sourceReports[].questionCount` records the selected
  near-miss row count, not the full candidate report size, so lineage matches the
  emitted `questionIds`. The
  rationale-bearing/full loader proof selected the intended 3 rows with
  `executionFailures: 0`, while default retrieval found 0/3 evidence recall
  and 9 noise turns; the broader 4-row loader still finds only 1/4 fully.
  Targeted smoke reports now persist `questionSelection` lineage for the
  manifest path and repair-job filters, and shared report validation rejects
  malformed present lineage, so follow-up repair evidence no longer depends on
  run-id naming conventions to explain how the selected `questionIds` were
  produced.
  This points to noise/context organization, rationale-bearing gold label work,
  default-retrieval gaps, and live-repeatability risk, not a defaultable
  answer-policy change.
- The rel0.8 multi_hop near-miss queue has also been expanded directly from the
  full 28-row candidate-admission token-F1 delta: 10 near misses, 7 balanced
  partial overlaps, 1 over-specified answer, 2 under-specified answers, with
  2 full-recall, 5 partial-recall, and 3 zero-recall rows. The 10-row loader
  proof consumed the artifact with `executionFailures: 0`, but default retrieval
  found 0/10 evidence recall and 44 noise turns. Its `goldEvidenceSupport`
  diagnostic averages 0.6368856634 declared-evidence support recall, with
  1 full-support and 9 partial-support rows. A same-provider timeout15 focused
  retry now gives this queue a clean admission comparison: provider-only
  baseline `locomo-multihop-near-miss-provider-baseline-10row-timeout15-current`
  stayed at 0 recall / 0 fully retrieved / 44 noise, while rel0.8 semantic
  admission `locomo-multihop-near-miss-rel08-retrieval-10row-timeout15-current`
  reached 0.4142857143 recall, 2/10 fully retrieved, and 107 noise with
  `executionFailures: 0`; paired delta
  `locomo-multihop-near-miss-provider-vs-rel08-timeout15-retrieval-delta-current`
  records +63 noise turns. The same queue's live-answer validation keeps the
  answer boundary negative: provider-only live baseline
  `locomo-multihop-near-miss-provider-baseline-live-10row-timeout15-current`
  scored 0/10, and rel0.8 live
  `locomo-multihop-near-miss-rel08-live-10row-timeout15-current` also scored
  0/10 while preserving the +0.4142857143 recall / +2 fully retrieved gain.
  Live-delta
  `locomo-multihop-near-miss-provider-vs-rel08-live-10row-timeout15-delta-current`
  records 10 same-wrong rows, 7 unconverted retrieval gains, 2 full-recall
  noisy wrong rows, and 9 token-F1 near misses. The follow-up label artifact
  `locomo-multihop-near-miss-rel08-live-10row-timeout15-label-analysis-current`
  classifies those 9 near misses as 6 balanced partial overlaps, 1
  numeric/frequency-format, 1 over-specified, and 1 under-specified. Use this
  as the fuller multi_hop repair queue; it points to candidate-pool admission
  plus answer synthesis, noise, and label/answer-contract work, not a
  default-profile promotion. Gold-evidence-only replay over those 9 near-miss
  rows, `locomo-multihop-near-miss-rel08-live-10row-timeout15-gold-only-current`,
  scored 1/9 with `executionFailures: 0`; paired delta
  `locomo-multihop-near-miss-rel08-live-10row-timeout15-normal-vs-gold-only-delta-current`
  shows +1 answer, 0 regressions, no retrieval/noise delta, and a single
  partial-evidence improvement (`conv-42:q76`) attributed to answer context
  change. Residual label analysis
  `locomo-multihop-near-miss-rel08-live-10row-timeout15-gold-only-label-analysis-current`
  leaves 6 near misses: 5 balanced partial overlaps and 1 under-specified
  answer. Treat gold-only context as a narrow diagnostic win, not a broad repair.
  The residual label artifact is now also loader-proven for follow-up repair:
  broad loader `locomo-multihop-near-miss-gold-only-label-file-loader-smoke-current`
  consumed all 6 rows with `executionFailures: 0` but default retrieval found
  0 recall, 0/6 fully retrieved, and 29 noise turns. Filtered repair-job loaders
  cover every emitted queue: balanced/full 2 rows
  `locomo-multihop-near-miss-gold-only-label-balanced-full-loader-smoke-current`
  at 0 recall / 9 noise, balanced/partial 3 rows
  `locomo-multihop-near-miss-gold-only-label-balanced-partial-loader-smoke-current`
  at 0 recall / 14 noise, and under-specified/partial 1 row
  `locomo-multihop-near-miss-gold-only-label-under-specified-partial-loader-smoke-current`
  at 0 recall / 6 noise.
  The same residual queue now has a provider-backed candidate-admission
  comparison: provider-only baseline
  `locomo-multihop-near-miss-gold-only-label-provider-baseline-6row-timeout15-current`
  stayed at 0 recall / 0 fully retrieved / 29 noise, while rel0.8 semantic
  admission
  `locomo-multihop-near-miss-gold-only-label-rel08-retrieval-6row-timeout15-current`
  reached 0.6071428571 recall, 2/6 fully retrieved, and 67 noise with
  `executionFailures: 0`. Paired delta
  `locomo-multihop-near-miss-gold-only-label-provider-vs-rel08-retrieval-6row-timeout15-delta-current`
  records +0.6071428571 recall, +2 fully retrieved, +38 noise turns, and
  1.5977443609 recall per 100 added noise turns. Treat this as targeted
  retrieval repair evidence only; it still needs live-answer conversion before
  it can affect default/category scoring.
- Do not use `locomo-multihop-near-miss-top32-add8-current` as a no-floor
  comparison. It attempted the 10-row queue with provider embeddings and no
  relative-score floor, but all 10 rows failed under the 120s run watchdog and
  retrieved no turns.
- The next useful LoCoMo performance movement is therefore not another guard
  pass over the same artifacts. It is a focused repair loop over the banked
  queues: candidate-pool admission for missing-evidence rows, noise/context
  organization for full-recall noisy wrong rows, and label-compatibility review
  for rationale-bearing or balanced-partial-overlap near misses. Any lift still
  needs paired live/reanswer evidence and category-slice regression checks before
  default-profile promotion.
- Coordinate any shared recall-routing change with the BEAM workstream and
  verify a BEAM rules-only recall diagnostic spot-check (`caseDeltaCount: 0`)
  before treating it as safe cross-benchmark evidence.
- Keep `eval:phase-65-smoke` report directories canonical: `--run-id` must be
  a single path segment so smoke reports, live progress checkpoints, and
  extraction caches stay under the intended `--output-dir`.
- Keep `eval:phase-65-smoke` source roots canonical: `GOODMEMORY_LOCOMO_ROOT`
  must not be empty or whitespace-padded before smoke/live runs use it as the
  benchmark-root fallback.
- Keep `eval:phase-65-reanswer-report` output directories canonical: output
  `--run-id` must be a single path segment before source reports are read, so
  reanswer and gold-evidence-only replay reports stay under the intended
  `--output-dir`.
- Keep `analyze:phase-65-locomo-budget-delta` derived output directories
  canonical: `--run-id` must be a single path segment before the analyzer
  derives its default output path from `--candidate-report` plus `--run-id`.
- Keep `analyze:phase-65-locomo-live-delta` derived output directories
  canonical for delta artifacts and exported reanswer queues: `--run-id` must
  be a single path segment before the analyzer derives its default output path
  from `--candidate-report` plus `--run-id`.
- Keep `analyze:phase-65-locomo-candidate-admission-slice` derived output
  directories canonical for repair manifests and exported reanswer queues:
  `--run-id` must be a single path segment before the analyzer derives its
  default output path from `--candidate-report` plus `--run-id`.
- Keep `summarize:phase-65-locomo-categories` derived output directories
  canonical for full-root category matrices: `--run-id` must be a single path
  segment before the assembler derives its default output path from the first
  `--report`.
- Keep `analyze:phase-65-locomo-category-gaps` derived output directories
  canonical for category-gap diagnostics: `--run-id` must be a single path
  segment before the analyzer derives its default output path from the first
  `--report`.
- Keep `analyze:phase-65-locomo-answer-policy-slice` derived output directories
  canonical for answer-policy replay manifests: `--run-id` must be a single
  path segment before the selector derives its default output path from the
  first `--report`.
- Keep `analyze:phase-65-locomo-near-miss-labels` derived output directories
  canonical for token-F1 near-miss diagnostics: `--run-id` must be a single
  path segment before the analyzer derives its default output path from
  `--live-delta`.
- Keep `analyze:phase-65-locomo-retrieval-gap` derived output evidence
  auditable: output `--run-id` must be a single path segment before deriving a
  default output path from the source smoke report, output paths must not
  overwrite the source report or resolved cases source, and the generated
  analysis should persist diagnostic-only claim boundary, generation timestamp,
  source report, cases source, output run id, and output path lineage.
- Keep eval-only retrieval-probe source roots canonical:
  `GOODMEMORY_LOCOMO_ROOT` must not be empty or whitespace-padded before
  dialog-window or rules-light query-expansion probes use it as the
  benchmark-root fallback.
- Keep `measure-locomo-union-live.ts` run directories canonical for legacy
  union live evidence: `--run-id` must be a single path segment before progress
  checkpoints, extraction caches, or `union-live-report.json` are written under
  `--output-dir`.
- Keep `run-phase-65-locomo-embedding-free-comparison.ts` source and output
  paths distinct: `--output-dir` must not resolve to the same path as
  `--benchmark-root`, so gateway-free comparison reports do not land in the
  external benchmark root.
- Keep Phase 65 measurement source roots canonical:
  `GOODMEMORY_LOCOMO_ROOT` must not be empty or whitespace-padded before
  `measure-locomo-levers.ts`, `measure-locomo-neural.ts`,
  `measure-locomo-union-live.ts`, or
  `run-phase-65-locomo-embedding-free-comparison.ts` use it as the
  benchmark-root fallback.
- Keep `prepare:phase-65-locomo-captioned` source roots canonical:
  `GOODMEMORY_LOCOMO_ROOT` must not be empty or whitespace-padded before it is
  used as the source-root fallback for captioned-root fixture prep.
- Keep `prepare:phase-65-locomo` source and output files distinct:
  specify either `--source-file` or `--source-url`, not both, and `--source-file`
  must not resolve to `--output-root/cases.json`, so local raw LoCoMo source
  fixtures are not overwritten by the generated normalized root. Remote
  `--source-url` fetches must return an OK response before their body is parsed
  as source JSON. `GOODMEMORY_LOCOMO_ROOT` must not be empty or
  whitespace-padded before output-root resolution.
