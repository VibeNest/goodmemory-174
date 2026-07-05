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
answer-policy repair. Phase 63 BEAM remains partial under its own answer-gap
workstream, and Phase 64 MemoryAgentBench is closed for the scoped public CR/TTL
claim.


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
- Treat open_domain commonsense/strict-no-evidence probes as opt-in evidence
  until broader category validation proves they do not regress single_hop,
  multi_hop, temporal, or adversarial slices.
- Keep evidence-pack category routing explicit: LoCoMo `multi_hop` live/reanswer
  evidence-pack contexts should use the shared `multi_session_reasoning`
  framing, and `adversarial` contexts should use the shared `abstention`
  framing. This is deterministic answer-context hardening until a focused live
  slice proves whether it changes scores.
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
