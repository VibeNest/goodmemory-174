# Phase 49 Full ImplicitMemBench Research Fixtures

This directory does **not** vendor the full upstream benchmark.

It contains:

- `adapter-manifest.json`: checked-in scorer routing and deterministic
  distilled-feedback rules for the full upstream task-file set
- `dataset/`: a mirrored **smoke subset** used by tests and the deterministic
  Phase 49 gate

Upstream source:

- Paper: https://arxiv.org/abs/2604.08064
- Repository: https://github.com/qinchonghanzuibang/ImplicitMemBench
- Dataset license: CC BY 4.0

The full 300-instance benchmark must be provided at runtime through
`--benchmark-root` or `GOODMEMORY_IMPLICITMEMBENCH_ROOT`. Phase 49 uses the
mirrored subset only for deterministic harness validation; it does not claim to
be a substitute for the full benchmark.
