# External Benchmark Smoke Fixtures

This directory contains small hand-authored structural fixtures for external
benchmark adapter smoke tests. It does not vendor full upstream benchmark data.

## LongMemEval

- Upstream repository: https://github.com/xiaowu0162/LongMemEval
- Dataset release: https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned
- Code license: MIT
- Dataset source: external LongMemEval release on Hugging Face / upstream links
- Local smoke fixture policy: synthetic shape-compatible cases only

## BEAM

- Paper: https://arxiv.org/abs/2510.27246
- Dataset release: https://huggingface.co/datasets/Mohammadta/BEAM
- 10M dataset release: https://huggingface.co/datasets/Mohammadta/BEAM-10M
- Visible dataset license: cc-by-sa-4.0
- Dataset format: Parquet upstream; local smoke fixture is a synthetic JSON
  projection of the same top-level columns
- Local smoke fixture policy: synthetic shape-compatible cases only, with no
  upstream rows vendored into this repository
