Phase 64 Breakdown: MemoryAgentBench Agent-Memory Hardening
===========================================================

Status
------

[ACTIVE] Phase 64 is active: Phase 63 BEAM was explicitly paused on 2026-06-15
(parked at rules-only retrieval recall 0.9621, README benchmark row recorded).

Progress: P64-T001/T002 done (source intake + synthetic smoke contract). P64-T003
done: external-root adapter + retrieval-only smoke report
(scripts/run-phase-64-memory-agent-bench-smoke.ts, eval:phase-64-smoke). P64-T004
done: the report emits per-competency evidence recall, noise, stale, and TTL
action-policy readiness; first run recorded (executionFailures 0, evidence recall
1.0 across AR/TTL/LRU/CR). P64-T005 in progress: investigation showed the "CR
stale-selection" is NOT a retrieval bug (GoodMemory keeps value history
retrievable on purpose; explicit-over-explicit supersession would regress BEAM
knowledge_update) — conflict resolution is decided at ANSWER time. Added a
deterministic live-answer scaffold (injectable answerGenerator, answer scored via
match modes, mode retrieval-only|live-answer, per-competency answerAccuracy);
additive only, zero BEAM blast radius. Next: wire a real generator (LLM, later);
then noise_budgeting once larger external cases give real distractor pressure.


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


Readiness Analyzer
------------------

`scripts/analyze-phase-64-readiness.ts` consumes a Phase 63
`recall-diagnostic-analysis.json` file and writes a Phase 64 preparation report.
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

When Phase 64 becomes active, the first adapter should report these fields from
the smoke run:

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
