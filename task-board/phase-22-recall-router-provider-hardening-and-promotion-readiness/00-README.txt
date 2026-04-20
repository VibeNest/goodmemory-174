Phase 22 Breakdown
==================

Purpose
-------
Harden the internal recall-side LLM router provider path enough for promotion-readiness evaluation without promoting it to the default path.


Current Status
--------------
- Phase 22 is closed and accepted as a provider hardening and evidence slice.
- Canonical deterministic gate:
  - `reports/quality-gates/phase-22/run-20260420020541/phase-22-quality-gate.json`
- Canonical provider-backed live-memory runs:
  - `reports/eval/live-memory/phase-22/run-1776650772564-observe/report.json`
  - `reports/eval/live-memory/phase-22/run-1776650772564-assist/report.json`


Execution Order
---------------
1. 01-provider-wire-shape-and-diagnostics.txt
2. 02-observe-assist-stress-eval.txt
3. 03-quality-gate-and-live-evidence.txt
