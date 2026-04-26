Phase 42 Breakdown: Progressive Recall Protocol
===============================================

Follow the parent task file:

- `task-board/45-phase-42-progressive-recall-protocol.txt`

Task order:

1. contract and failing tests
2. ProgressiveRecallService
3. recordRef protocol
4. progressive context renderer
5. MCP adapter tools
6. installed-host contextMode
7. security, redaction, and fallback regressions
8. evals, gate, docs, and closure

Working rules:

- Keep the root public API stable.
- Build one shared service first, then adapters.
- Use recordRef values for detail reads; never accept bare ids.
- Expose scopeDigest, not raw scope fields.
- Progressive mode must degrade to fragment when MCP/detail access is absent.
- Do not copy code from `third-party/claude-mem-main`.

Accepted evidence:

- `reports/eval/fallback/phase-42/run-20260426093000/report.json`
- `reports/quality-gates/phase-42/run-20260426100000/phase-42-quality-gate.json`
- `docs/archive/quality-gates/GoodMemory-Phase-42-Quality-Gate.md`
