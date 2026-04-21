# Phase 30 Trace-Backed Behavioral Enactment Fixtures

These fixtures are a small curated/adapted subset inspired by
ImplicitMemBench:

- Paper: https://arxiv.org/abs/2604.08064
- Repository: https://github.com/qinchonghanzuibang/ImplicitMemBench
- Dataset license: CC BY 4.0

The fixtures are intentionally small and internal. They are not a vendored copy
of the upstream benchmark. They adapt the benchmark's
learning/interference/probe protocol to GoodMemory's trace-backed behavioral
eval harness so Phase 30 can verify first-action enactment from replayed
experience, outcome telemetry, and promoted validated patterns without widening
the public API.
