Phase 36 Breakdown
==================

Status
------
- Phase 36 is closed and accepted.
- Scope: add public domain-specific write customization through remember presets, profiles, rules, annotations, and traceable extractor composition.
- The core write pipeline remains universal and stable.
- OneLife is the motivating example, but the deliverable is a generic public library capability.
- Root `goodmemory` API may widen additively through `GoodMemoryConfig.remember` and `RememberInput.annotations`.
- Existing zero-config behavior, provider-assisted extraction, policy hooks, and installed-host middleware must remain compatible.


Execution Order
---------------
1. 01-freeze-public-remember-contract.txt
2. 02-profile-resolution-and-extractor-chain.txt
3. 03-rules-dsl-and-message-annotations.txt
4. 04-assistant-policy-and-domain-metadata.txt
5. 05-docs-examples-and-onelife-reference.txt
6. 06-phase-36-evals-gate-and-closure.txt


Acceptance
----------
- public `remember` config exists and is type-tested
- built-in `default` and `coding_agent` write presets preserve existing behavior
- domain profiles can be selected by scope or custom matcher
- rules and custom extractors compose with assisted extraction instead of replacing the pipeline
- named custom extractors keep stable trace ids for replayed evals and audit output
- message annotations can explicitly suppress, force, or enrich candidate writes
- assistant-originated durable writes are opt-in and evidence-gated
- remember traces explain profile, rule, extractor, annotation, and strategy influence
- domain metadata can represent life-coach concepts without new top-level memory kinds
- deterministic and provider-backed evidence proves the new public surface is non-regressive

Canonical Evidence
------------------
- deterministic report: `reports/eval/fallback/phase-36/run-20260423221045/report.json`
- live-memory report: `reports/eval/live-memory/phase-36/run-phase36-live-current/report.json`
- quality gate: `reports/quality-gates/phase-36/run-20260423223045/phase-36-quality-gate.json`
- archive summary: `docs/archive/quality-gates/GoodMemory-Phase-36-Quality-Gate.md`


Canonical Inputs
----------------
- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `task-board/36-phase-35-installed-host-memory-middleware-and-hooks.txt`
- `src/api/contracts.ts`
- `src/api/createGoodMemory.ts`
- `src/remember/`
- `src/provider/memory-extractor.ts`


Files in This Folder
--------------------
- 01-freeze-public-remember-contract.txt
  Define the public config, type names, compatibility guarantees, and non-goals.

- 02-profile-resolution-and-extractor-chain.txt
  Implement profile matching and deterministic/assisted/custom extractor composition.

- 03-rules-dsl-and-message-annotations.txt
  Add the public rules helpers and host annotations that steer memory writes.

- 04-assistant-policy-and-domain-metadata.txt
  Add assistant-output guardrails and domain-extensible metadata storage.

- 05-docs-examples-and-onelife-reference.txt
  Document the API and add a life-coach reference integration without hardcoding OneLife.

- 06-phase-36-evals-gate-and-closure.txt
  Add deterministic/live evals, a dedicated gate, and closure documentation.
