# Independent C4 dataset review

Review only the frozen C4 dataset assets and deterministic readiness core
listed by `fixtures/codex-coding-effect/c4-controlled-pilot/review/input-bundle.json`. The
dataset root is `fixtures/codex-coding-effect/c4-controlled-pilot` and the readiness core is
`reports/quality-gates/phase-73/c4-controlled-pilot-core.json`. Do not inspect baseline results, C4
paired A/B results, C5 results, or any other coding outcome artifact.

Required input-bundle SHA-256: `4b46e56810ddbc294ca2410f5e51b470235e587560900a6babd7490ad9dabe0b`.

For every one of the six episodes, independently decide whether:

- the task is real coding work rather than trivia;
- hidden tests are fair and prompt/repository discoverable;
- memory is useful context but does not contain the answer or patch;
- negative controls are credible;
- the shared evaluator has no repository-specific exception.

Write only `review/independent-review.json` using schemaVersion 2. Set
`scope` to `dataset-only-no-coding-outcomes`, both inspected flags to
false, and `inputBundleSha256` to the required hash above. Use status
`accepted` only when every check passes; otherwise use `changes-requested`
and leave each failed check as false. Set `reviewerTaskName` to
`/root/c4_final_independent_review`. Do not edit any other file.
