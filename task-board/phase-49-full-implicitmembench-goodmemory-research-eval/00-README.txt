Phase 49 Breakdown: Full ImplicitMemBench GoodMemory Research Eval
==================================================================

Follow the parent task file:

- `task-board/54-phase-49-full-implicitmembench-goodmemory-research-eval.txt`

Task order:

1. dataset adapter and manifest [DONE]
2. research profiles and scorers [DONE]
3. scripts, smoke gate, and regressions [DONE]
4. archive and research evidence [DONE]

Working rules:

- Keep this slice internal-only and research-only.
- Do not re-inject learning/interference into the final GoodMemory prompt.
- Keep priming paired and omit it from distilled-feedback.
- Require explicit scorer routing for every upstream task file.
- Make smoke evidence canonical; full-300 runs stay optional live research.
