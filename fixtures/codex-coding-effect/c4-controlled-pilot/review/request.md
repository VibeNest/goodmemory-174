# Independent C4 dataset review

Review only the frozen C4 dataset assets and deterministic readiness core
listed by `fixtures/codex-coding-effect/c4-controlled-pilot/review/input-bundle.json`. The
dataset root is `fixtures/codex-coding-effect/c4-controlled-pilot` and the readiness core is
`reports/quality-gates/phase-73/c4-controlled-pilot-core.json`. Do not inspect baseline results, C4
paired A/B results, C5 results, or any other coding outcome artifact.

Required input-bundle SHA-256: `7085659b4914399f99a0f55ce2c1ad19655ba1c03c542e7072d6408bf1074bf1`.

For every one of the six episodes, independently decide whether:

- the task is real coding work rather than trivia;
- hidden tests are fair and prompt/repository discoverable;
- negative controls are credible;
- the shared evaluator has no repository-specific exception.

Set `memoryExpectationMode` from the episode's later-stage
`memoryExpectation.mode`, then apply exactly one mode-specific check:

- for `required`, include only `memoryUsefulNotAnswer` and decide whether
  memory is useful context but does not contain the answer or patch;
- for `irrelevant-control`, include only
  `memoryIrrelevantAndNonMisleading` and decide whether the unrelated
  memory is genuinely irrelevant and does not mislead the implementation.

These two memory checks are mutually exclusive. Do not include the check
for the other mode in the episode's `checks` object.

Write only `review/independent-review.json` as one strict JSON object.
It must contain exactly these top-level fields:

- `schemaVersion`: 2;
- `datasetId`, `assetLockSha256`, `assetRootSha256`, `manifestSha256`,
  `leakageAuditSha256`, and `readinessCoreSha256`: copy the exact values
  from the input bundle;
- `inputBundleSha256`: `7085659b4914399f99a0f55ce2c1ad19655ba1c03c542e7072d6408bf1074bf1`;
- `scope`: `dataset-only-no-coding-outcomes`;
- `reviewerTaskName`: `/root/c4_final_independent_review_v3`;
- `reviewer`: a non-empty reviewer label;
- `reviewedAt`: the review completion timestamp;
- `c4AbResultsInspected`: false;
- `codingOutcomeArtifactsInspected`: false;
- `publicCodingEffectProof`: false;
- `status`: `accepted` or `changes-requested`; and
- `episodeReviews`: exactly six objects, one for each manifest episode.

Each `episodeReviews` object must contain exactly:

- `episodeId`: copy the manifest episode `id`;
- `author`: copy the manifest episode `author`;
- `memoryExpectationMode`: `required` or `irrelevant-control`;
- `rationale`: a non-empty explanation; and
- `checks`, with `codingNotTrivia`, `hiddenTestsFair`,
  `negativeControlCredible`, and
  `noRepositorySpecificRunnerException`, plus exactly one applicable
  memory check described above.

Use `accepted` only when every shared check and applicable memory check
is true. Otherwise use `changes-requested` and leave each failed check
false. Do not add aliases, per-episode status fields, or other keys.
Do not edit any other file.
