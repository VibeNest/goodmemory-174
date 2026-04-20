Phase 23 Breakdown
==================

Purpose
-------
Land internal-only controlled default promotion for recall-side `llm-assisted` without widening the public surface.


Current Status
--------------
- Phase 23 is closed and accepted as an internal controlled-promotion slice.
- Canonical deterministic gate:
  - `reports/quality-gates/phase-23/run-20260420061039/phase-23-quality-gate.json`
- Canonical provider-backed live-memory runs:
  - `reports/eval/live-memory/phase-23/run-1776658376536-observe/report.json`
  - `reports/eval/live-memory/phase-23/run-1776658376536-assist/report.json`
  - `reports/eval/live-memory/phase-23/run-1776658376536-promote/report.json`


Execution Order
---------------
1. 01-internal-runtime-promotion-bridge.txt
2. 02-observe-assist-promote-eval-chain.txt
3. 03-quality-gate-and-archived-evidence.txt
