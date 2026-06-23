Phase 65 Breakdown: LoCoMo Very-Long-Term Conversational-Memory Hardening
========================================================================

Status
------

[BRING-UP DONE] Phase 65 LoCoMo is the fourth leg of the Sequential Benchmark
Hardening Plan and the last in the sequence (LongMemEval -> BEAM ->
MemoryAgentBench -> LoCoMo). Bring-up T001-T004 is complete and on main; the
live LLM answer/judge layer is deferred (the LLM call has not been restored).

Phase 64 MemoryAgentBench remains the active hardening leg (its real live-answer
path exists behind `--live`, but no accepted external-root live closure exists).
Phase 63 BEAM live closure is deferred per the user.


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

- P65-T005 (deferred): wire a real LLM answer generator (deferred — LLM call not
  restored), then prepare an external root (GOODMEMORY_LOCOMO_ROOT/cases.json,
  normalized from upstream, NOT vendored) and run the rules-only retrieval slice
  for genuine multi-hop / temporal / adversarial pressure. Apply the same
  changed-case-comparison discipline used for BEAM/MAB: one named miss family,
  one focused regression, one scoped repair, rerun + compare, no dataset-specific
  keyword branches as a first fix.
- Coordinate with the concurrent BEAM workstream on any shared recall-routing
  change (see the concurrent-agent shared-repo hazard note): use --only pathspec
  commits and verify a BEAM recall-diagnostic spot-check before relying on any
  cross-cutting recall change.
