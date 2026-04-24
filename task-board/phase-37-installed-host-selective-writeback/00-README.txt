Phase 37 Breakdown
==================

Status
------
- Phase 37 is closed.
- Scope: installed-host selective writeback for Codex first.
- The accepted Phase 35 installed-host recall path remains the base layer.
- The accepted Phase 36 public remember configuration path remains the only durable write path.
- Root `goodmemory` API stays unchanged.
- Default writeback mode is `off`.
- `observe` mode is the safety buffer: it emits candidates and trace, but writes nothing.
- `selective` mode writes only high-value candidates through public remember profiles, rules, annotations, and policies.
- No raw transcript durable persistence is allowed.
- Codex is the canonical implementation and live evidence path. Claude does not block closure.
- Canonical deterministic evidence: `reports/eval/fallback/phase-37/run-20260424101045/report.json`
- Canonical provider-backed assisted-extraction live evidence: `reports/eval/live-memory/phase-37/run-phase37-live-current/report.json`
- Canonical external consumer evidence: `reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json`
- Canonical quality gate: `reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json`


Execution Order
---------------
1. 01-contract-and-failing-tests.txt
2. 02-installed-host-writeback-config.txt
3. 03-observe-runtime-and-json-trace.txt
4. 04-selective-public-remember-writeback.txt
5. 05-cli-wiring-and-install-opt-in.txt
6. 06-deterministic-eval.txt
7. 07-provider-backed-live-smoke.txt
8. 08-external-consumer-smoke.txt
9. 09-quality-gate-and-regression.txt
10. 10-docs-status-and-closure.txt


Acceptance
----------
- Codex installed host supports opt-in writeback modes: `off`, `observe`, and `selective`.
- `observe` produces candidates and trace, but writes nothing to durable memory.
- `selective` writes durable memory only through the public `remember` surface.
- no raw transcript is persisted as durable memory.
- assistant-originated durable memory is blocked unless host annotation confirms or verifies it and active policy allows it.
- `remember: "never"` masks content before extraction.
- two-session Codex evidence proves automatic writeback followed by next-session recall without manual `goodmemory remember` seeding.
- deterministic Phase 37 eval is accepted.
- provider-backed live-memory smoke is accepted.
- repo-external consumer smoke is accepted.
- Phase 35 and Phase 36 gates still pass.


Canonical Inputs
----------------
- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `docs/GoodMemory-TDD-and-Evaluation-Strategy.md`
- `task-board/36-phase-35-installed-host-memory-middleware-and-hooks.txt`
- `task-board/37-phase-36-public-domain-write-profiles-and-rules.txt`
- `src/install/hostConfigValidation.ts`
- `src/install/hostExecutionContext.ts`
- `src/install/hostHookRuntime.ts`
- `src/cli.ts`
- `src/remember/`


Files in This Folder
--------------------
- 01-contract-and-failing-tests.txt
  Freeze scope, non-goals, result contracts, and failing tests before implementation.

- 02-installed-host-writeback-config.txt
  Add managed installed-host writeback config with safe defaults and context propagation.

- 03-observe-runtime-and-json-trace.txt
  Implement the writeback runtime in observe mode so candidates can be audited without writes.

- 04-selective-public-remember-writeback.txt
  Connect selective writeback to Phase 36 public remember profiles, rules, annotations, and assistant policy.

- 05-cli-wiring-and-install-opt-in.txt
  Add the Codex writeback command and conservative install/enable writeback opt-in.

- 06-deterministic-eval.txt
  Add deterministic Phase 37 eval cases and report summary fields.

- 07-provider-backed-live-smoke.txt
  Prove provider-backed automatic writeback plus next-session recall without manual seeding.

- 08-external-consumer-smoke.txt
  Verify a repo-external packed-package consumer can install, enable, write back, and recall.

- 09-quality-gate-and-regression.txt
  Add `gate:phase-37` and require Phase 35/36 regression gates.

- 10-docs-status-and-closure.txt
  Sync README, current-status, archive docs, reports, and release-facing checks.
