# GoodMemory Phase 36 Quality Gate

Canonical gate run: `run-20260423223045`

Canonical provider-backed live report: `run-phase36-live-current`

## Command

```bash
bun run gate:phase-36
```

## Scope

- public domain write customization through:
  - `GoodMemoryConfig.remember`
  - `RememberProfile`
  - `rememberRules`
  - `RememberInput.annotations`
- built-in `default` and `coding_agent` preset IDs
- profile selection by scope matcher or custom matcher
- deterministic regex, predicate, and direct mapper rules
- public custom extractors composed with the existing deterministic and assisted extractor chain
- assistant-output writes remaining ignored by default and allowed only with host annotations plus an allowing profile policy
- domain metadata on preferences, facts, references, and feedback without widening top-level memory kinds
- remember traces for profile, preset, extractor, rule, annotation, and extraction strategy influence
- Markdown export of domain metadata for auditability
- deterministic and provider-backed evidence for a life-coach style integration using public config only

Out of scope:

- making OneLife a built-in preset
- requiring provider-backed extraction or storage for zero-config users
- adding a stage-by-stage plugin platform
- reopening recall routing or retrieval profile promotion
- automatic assistant-answer memory without host confirmation or verification

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-36/run-20260423223045/phase-36-quality-gate.json`
- Deterministic fallback replay output (ignored generated):
  - `reports/eval/fallback/phase-36/run-20260423221045/report.json`
- Provider-backed live-memory report:
  - `reports/eval/live-memory/phase-36/run-phase36-live-current/report.json`

## Results

- Deterministic fallback replay output (ignored generated): accepted.
- Provider-backed live-memory report: accepted.
- `gate:phase-36` proves:
  - `bun run typecheck` passed
  - targeted remember profile, extraction, engine, markdown artifact, runner, and gate regressions passed
  - deterministic Phase 36 eval passed every public customization case
  - provider-backed assisted extraction ran while public profile rules wrote domain memory through the normal pipeline
  - host `remember: "never"` annotations suppress content before deterministic, custom, or assisted extraction
  - annotation metadata, rules, profile, custom extractor, and assisted extraction influence remain visible in remember traces
  - named public custom extractors keep stable trace ids for replayed evals and audit output
  - default preset and assisted-only candidates carry resolved profile/preset trace metadata

## Evidence Rule

Only the gate run above, deterministic fallback replay output (ignored generated) above, and provider-backed live-memory report above are canonical for Phase 36. If future evidence is repointed, update this archive doc, `docs/GoodMemory-Current-Status-and-Evidence.md`, `task-board/00-README.txt`, and release tests together.

## Decision

Phase 36 is accepted. GoodMemory now exposes public domain write profiles and rules so server-side agents can customize what gets remembered without relying on `testing.extractor`, replacing the core extractor, or bypassing normalization, classification, policy, evidence, conflict handling, vector writes, rollback, and export auditability.
