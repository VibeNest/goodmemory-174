# GoodMemory Documentation Map

This directory is intentionally a routed documentation surface, not a corpus to
bulk-load. Start here, then open only the file that matches the question.

## Current Truth

- `GoodMemory-Current-Status-and-Evidence.md` - current shipped surface,
  accepted evidence, active phase, and claim boundaries.
- `GoodMemory-PRD.md` - product scope and behavioral contract.
- `GoodMemory-First-Principles-and-Reference-Architecture.md` - stable design
  principles and reference architecture.
- `GoodMemory-OSS-Architecture-v1.md` - current package/module architecture.
- `GoodMemory-TDD-and-Evaluation-Strategy.md` - test and eval strategy.
- `GoodMemory-v1-Release-Checklist.md` - release checklist.

## Public Integration Docs

- `GoodMemory-15-Minute-App-Integration.md` - shortest app integration path.
- `GoodMemory-Reference-Integration-Guide.md` - reference consumer pattern.
- `GoodMemory-Codex-Handoff-Setup-Guide.md` - Codex installed-host setup.
- `GoodMemory-Claude-Code-Setup-Guide.md` - Claude Code installed-host setup.
- `GoodMemory-Python-HTTP-Integration-Bridge.md` - Python/FastAPI bridge.
- `GoodMemory-Strategy-Rollout-Guide.md` - observe/assist/promote rollout.

## Research And Evidence

- `GoodMemory-ImplicitMemBench-Full-300-Research-Summary.md` - internal
  ImplicitMemBench research summary. Do not treat it as a release gate.
- `Sequential Benchmark Hardening Plan.md` - external benchmark sequence.
- `archive/quality-gates/README.md` - historical quality-gate index.
- `reports/eval/` and `reports/quality-gates/` - generated evidence artifacts.

## Archive Policy

- `archive/design-inputs/` contains superseded drafts, competitor notes,
  cloud/member sketches, and app-specific planning inputs. These are not
  current truth.
- `archive/reference-corpus/` contains copied research/source material. These
  files are not routed by default and should be opened only for targeted
  provenance checks.

Do not add a new root-level planning document when an existing current-truth
document can be updated. If a document is replaced, move it under
`archive/design-inputs/` or delete it in the same change that updates links and
tests. Root-level docs should stay small enough for agent use.
