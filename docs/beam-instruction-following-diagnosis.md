# BEAM `instruction_following` 0.394 — diagnosis (why it is not a shaping bug)

**Claim boundary:** research diagnostic only. No runtime, README claim, or preset change accompanies
this note — it records *why* the `instruction_following` category is low and *why* we chose not to
"fix" it. Reproducible from on-disk artifacts (commands at the bottom).

## Summary

BEAM's `instruction_following` category scores **0.39375** under the official rubric judge (the single
category below the public reference 0.66; overall micro 0.8023). Investigation shows the gap is **not** a
retrieval gap and **not** an evidence-pack shaping bug. It is a **design tension**: the failing questions
ask the model to answer from **world knowledge** under a standing format/content instruction, while
GoodMemory correctly **grounds in the conversation and abstains** when the chat does not contain the
answer. The abstention discipline that *wins* on abstention (38/40), knowledge-update, adversarial, and
LongMemEval is exactly what is penalized here.

## The numbers

Source answers: `reports/eval/research/phase-63/beam/run-p5-beam-closure-rules-abstfmt-gpt54judge/live-slice-report.json`
(profile `goodmemory-rules-only` + evidence pack + abstention-format prompt, commit `5cee12c`, execFails 0).
Bucket counts are by the report's internal binary judge; the headline 0.39375 is the official rubric
re-judge (`reports/eval/research/official-rescore/rescore-beam-official-judge/rescore-summary.json`).

| Metric | Value |
|---|---:|
| instruction_following questions | 40 |
| wrong (internal binary) | **26** |
| wrong **with evidence fully retrieved** (recall ≥ 0.999) | **22** |
| average evidence recall (all 40) | **0.908** |
| wrong that were **correct abstentions** ("no information in the chat") | **17** |
| wrong that were **substantive but incomplete** | **9** |
| wrong from an actual retrieval gap (recall < 0.999) | 4 |
| official rubric meanScore | **0.39375** |

The decisive facts: retrieval is not the bottleneck (avg recall 0.908; 22/26 failures have the evidence
fully retrieved), and **17 of 26 failures are the model correctly abstaining** because the requested
content is not in the conversation.

## The failure mechanism (with evidence)

The questions are general-knowledge / capability prompts carrying a standing instruction about answer
format or content. The expected answer is world knowledge plus instruction adherence — it is not in the
stored chat. GoodMemory reports "no information in the chat" and abstains.

| QID | Got (GoodMemory) | Expected (rubric) | Judge reasoning |
|---|---|---|---|
| `2:instruction_following:1` | "…there is no information related to common API error responses." | "…include error status codes as part of the explanation about API issues." | "effectively a no-answer despite the expected content being known." |
| `2:instruction_following:2` | "…there is no information related to typical REST API errors…" | "…include error status codes…" | "fails to mention typical REST API errors or HTTP error status codes (4xx/5xx)." |
| `5:instruction_following:1` | "…there is no information related to calculating the chance of drawing a red card…" | "…a clear, sequential explanation of the calculation process with a specific example." | "incorrectly says there is no relevant information." |
| `3:instruction_following:2` | Lists `<header>`,`<nav>`,`<main>`,`<section>`,`<article>`,`<aside>`; notes the chat does not specify a footer. | "…explanations of semantic HTML5 tags and their appropriate usage…" | "fails to include `<footer>`… the note about the chat not specifying a footer is irrelevant." |

The first three (representative of the 17) are the abstention tension. The fourth (representative of the
9) is a substantive-but-incomplete answer — the harder, already heavily-shaped tail.

## Why we are not fixing it

1. **The plan's `selectOperationTurns` over-pruning hypothesis is falsified.** `selectOperationTurns`
   (`src/answer/evidencePack.ts:262-267`) does prune the base evidence to constraint-only for instruction
   ops, but that is not the cause here: the answers fail because there is **no in-chat evidence to
   surface** (world-knowledge questions), not because retrieved evidence was pruned. Avg recall 0.908
   confirms the evidence layer is not starving the answer.
2. **The only "fix" regresses a core strength.** Making the model answer these would require loosening
   abstention so it responds from world knowledge when the chat lacks the answer. That directly threatens
   the abstention discipline that GoodMemory is rewarded for elsewhere (abstention 38/40, knowledge-update,
   adversarial, LongMemEval). Reliably detecting "this instruction question wants world knowledge" is
   benchmark-shaped, not general.
3. **Diminishing returns already.** `src/answer/operations/instruction.ts` already carries extensive,
   partly benchmark-specific answer-content cue machinery and the category still sits at 0.394; the
   remaining 9 substantive cases are genuine completeness misses, not shaping bugs.

**Decision: KILL** by the plan's own kill criteria ("修改依賴 benchmark-specific wording" / "其他 BEAM
category 出現明顯回歸"). This validates and explains the standing directive not to reopen
`instruction_following` prompt-tuning. No answer code changed.

## Reproduction

```bash
R=reports/eval/research/phase-63/beam/run-p5-beam-closure-rules-abstfmt-gpt54judge/live-slice-report.json

# bucket counts
jq -r '[.cases[] | select(.questionType=="instruction_following")] as $if | {
  total: ($if|length),
  wrong: ($if|map(select(.correct==false))|length),
  fullRecallWrong: ($if|map(select(.correct==false and .evidenceChatRecall>=0.999))|length),
  avgRecall: (($if|map(.evidenceChatRecall)|add)/($if|length)),
  wrongAbstained: ($if|map(select(.correct==false and (.hypothesis|tostring|test("no information related to|does not contain|there is no information";"i"))))|length),
  wrongSubstantive: ($if|map(select(.correct==false and ((.hypothesis|tostring|test("no information related to|does not contain|there is no information";"i"))|not)))|length)
}' "$R"

# official rubric meanScore
jq '.categories.instruction_following // .instruction_following' \
  reports/eval/research/official-rescore/rescore-beam-official-judge/rescore-summary.json
```
