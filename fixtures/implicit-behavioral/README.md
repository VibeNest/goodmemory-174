# Phase 24 Implicit Behavioral Fixtures

These fixtures are a small curated/adapted subset inspired by
ImplicitMemBench:

- Paper: https://arxiv.org/abs/2604.08064
- Repository: https://github.com/qinchonghanzuibang/ImplicitMemBench
- Dataset license: CC BY 4.0

The fixtures are intentionally small and internal. They are not a vendored copy
of the upstream benchmark. They adapt the benchmark's learning/interference/test
protocol to GoodMemory's eval harness so Phase 24 can measure first-attempt
behavioral adaptation without changing the public API or default runtime path.
