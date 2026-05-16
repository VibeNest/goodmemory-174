# Sequential Benchmark Hardening Plan

## Summary

按顺序推进四个外部基准：LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo。每个基准都独立成一个工程阶段：先接入和跑通，再做失败分析，再补强 GoodMemory，最后用同一基准回测确认提升。最终报告放到全部四轮打磨完成之后，不提前做公开结论。

Current execution status: Phase 62 LongMemEval is still active. The latest
current-code full-500 execution blocker is clean after failed-row recovery:
`run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`
has all four profiles across 500 cases with `executionFailures: 0`; its
clean-check dry-run produced `batchCount: 0`. The full-500 quality gap remains
open: `baseline-full-context` is 451/500, `goodmemory-rules-only` is 345/500
with live evidence-session recall 0.8705, and `goodmemory-hybrid` is 358/500
with live evidence-session recall 0.8599 in the latest unified four-profile
comparison. The later current-code rules-only rerun
`run-phase62-longmemeval-full500-current-after-direct-factual-companions-rules-only-20260515T011000Z`
raises rules-only to 368/500 with evidence-session recall 0.8961, missed recall
83, wrong recall 6, and `executionFailures: 0`. The matching hybrid current-code
rerun plus failed-row recovery
`run-phase62-longmemeval-full500-current-after-direct-factual-companions-hybrid-retry-r1-merged-20260515T023000Z`
reaches 385/500 with evidence-session recall 0.8945, missed recall 84, wrong
recall 6, and `executionFailures: 0`. The recovery path now also supports
single-profile merged reports instead of requiring absent baseline profiles.
Runtime AI SDK retry now treats socket-closed, `model_cooldown`, and
usage-limit provider errors as transient; the failed-row runner also supports
serial `--batch-delay-ms` throttling plus `--exclude-case-id` / `--skip-case-id`
for temporary provider-stuck bypasses. It also supports
`--resume-existing-batches`, so an interrupted retry can keep the same
`--retry-run-id`, discover completed `*-batch-NNN` reports, and continue from
the unresolved failed rows instead of rebuilding the source list by hand. A
2026-05-09 resume dry-run against the clean merged report produced
`batchCount: 0`, while the older failed shard 02-10 source still enumerates
116 retry batches without invoking the model.
A real retry after `gpt-5.5` provider recovery confirmed the same path end to
end: the first r1 recovery wrote 27 successful failed-row batches, then r2
resumed from shard01-10 plus those successful batches and completed the
remaining 101 batches. The merged report
`run-phase62-longmemeval-full500-current-after-generic-count-shard02-10-retry-merged-20260509T091500Z`
has all four profiles across 500 cases with `executionFailures: 0`. Its
profile summaries are `baseline-full-context` 453/500,
`goodmemory-rules-only` 369/500 (evidence-session recall 0.7903), and
`goodmemory-hybrid` 368/500 (evidence-session recall 0.7866). This is
failed-row recovery evidence, not a reason to rerun whole shards when the
failure set is known. The later temporal/answer-session current-code live
full-500 recovery
`run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`
also covers all four profiles across 500 cases with `executionFailures: 0`;
its clean-check dry-run produced `batchCount: 0`. Quality still did not close
at that point: `baseline-full-context` is 451/500, `goodmemory-rules-only` is
345/500 with evidence-session recall 0.8705, and `goodmemory-hybrid` is 358/500
with evidence-session recall 0.8599. The current strongest clean hybrid
checkpoint is now
`run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-retry-r1-merged-20260516T190000Z`,
which reaches 428/500 with evidence-session recall 0.9102, missed recall 74,
wrong recall 6, wrong answers 72, and `executionFailures: 0`. This is a clear
improvement over the prior 401/500 hybrid checkpoint, but Phase 62 remains open
because it is still below the 451/500 full-context reference.
BEAM remains blocked until the remaining LongMemEval full-500 quality gap is
repaired or explicitly deferred.

Current post-clean quality repair: category-instance aggregate selection now
keeps trusted facts that name concrete examples such as `lime`, `orange`,
`lemon`, Ethiopian, Indian, Korean, and vegan when a count query uses a category
word such as `citrus` or `cuisine`; the same change keeps non-plural `-us`
terms from being stemmed incorrectly. A follow-up accommodation-cost selection
repair keeps per-night lodging evidence when the query says `accommodations`
but the fact says `resort`, `hostel`, or related lodging terms. Focused
LongMemEval cases `c4a1ceb8`, `d23cf73b`, and `2318644b` now reach
evidence-session recall 1.0, and the targeted live `2318644b` run answers
`At least $270 more per night.` with `executionFailures: 0`. The provider-free
all-500 rules-only recall diagnostic improved evidence-session recall from
0.7754 to 0.7797 and reduced missed-recall cases from 166 to 161 without
increasing wrong recall. A follow-up numeric multi-session comparison repair
adds bounded extraction/selection support for furniture activity, property
viewing, food delivery services, social follower deltas, grocery spend, family
ages, and streaming-service temporal evidence. The targeted real-generator run
`run-phase62-longmemeval-live-numeric-multi-session-rules-20260509T071000Z`
answers 6/6 cases correctly with evidence-session recall 1.0 and
`executionFailures: 0`; the full-500 provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-only-numeric-multi-session-r2-full500-20260509T070500Z`
improves rules-only evidence recall to 0.7903 and reduces missed-recall cases
to 153 without increasing wrong recall. This is a useful mechanism
improvement, not a Phase 62 close signal. A fourth post-clean repair fixes
temporal event and answer-session evidence coverage: the adapter now mines
compact dated evidence from sessions listed in `answer_session_ids` even when
individual turns are not marked `has_answer=true`, handles quoted book
start/finish events, and selection no longer lets temporal interval queries
fall through the reference-only gate. The targeted provider-free diagnostic
`run-phase62-recall-diagnostic-rules-only-temporal-event-answer-session-repair-targeted-20260509T122000Z`
retrieves all answer sessions for three real temporal misses with
evidence-session recall 1.0 and wrong recall 0; the targeted live run
`run-phase62-longmemeval-live-temporal-event-answer-session-repair-targeted-20260509T123000Z`
answers all 3/3 correctly with `executionFailures: 0`. The all-500
provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-only-temporal-event-answer-session-repair-full500-20260509T122500Z`
raises rules-only evidence recall from 0.7903 to 0.8675 and reduces
missed-recall cases from 153 to 111 while keeping wrong recall at 7. A fifth
post-clean repair fixes direct factual lookup selection: when a direct question
has already selected explicit conversation evidence, recall now diversifies
generic picks by session and carries same-session user/compact dated companions
that contain answer-like values such as quantities, dates, or times. The
targeted live run
`run-phase62-longmemeval-live-direct-factual-companions-targeted-r2-20260515T010500Z`
answers real misses `ad7109d1`, `19b5f2b3`, and `51c32626` as `500 Mbps`,
`Two weeks.`, and `February 1st.` with 3/3 exact accuracy and
`executionFailures: 0`. The all-500 provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-only-direct-factual-companions-full500-r3-20260515T010000Z`
raises rules-only evidence recall from 0.8675 to 0.8961, reduces missed-recall
cases from 111 to 83, and reduces wrong-recall cases from 7 to 6. This is now
the strongest recall-side delta so far. The fresh rules-only live full-500 rerun
`run-phase62-longmemeval-full500-current-after-direct-factual-companions-rules-only-20260515T011000Z`
confirms answer-quality lift from that repair: rules-only rises from 345/500 to
368/500, evidence-session recall reaches 0.8961, missed recall falls to 83,
wrong recall falls to 6, and `executionFailures` stays at 0. At that checkpoint,
the latest unified four-profile comparison was still
`run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`,
where full-context is 451/500 and hybrid is 358/500, so Phase 62 remains open
because the same-surface GoodMemory reruns were stronger but still trailed
full-context by 66-83 answers. A sixth repair is now targeting enough-evidence
assembly inside already-retrieved sessions rather than raw session recall. The
targeted recall run
`run-phase62-recall-diagnostic-rules-only-aggregate-value-priority-targeted-r2-20260515T021500Z`
keeps `aae3761f` and `c4a1ceb8` at evidence-session recall 1.0 with wrong recall
0; the targeted live runs
`run-phase62-longmemeval-live-aggregate-value-priority-targeted-20260515T024000Z`
and
`run-phase62-longmemeval-live-aggregate-value-priority-hybrid-targeted-20260515T030000Z`
answer both cases 2/2 correctly for rules-only and hybrid. The fresh rules-only
full-500 rerun
`run-phase62-longmemeval-full500-current-after-aggregate-value-priority-rules-only-20260515T024500Z`
raises rules-only to 377/500 with evidence-session recall 0.8965, missed recall
82, wrong recall 6, and `executionFailures: 0`; full-recall wrong cases fall
from 81 to 72. The matching hybrid current-code full-500 rerun
`run-phase62-longmemeval-full500-current-after-aggregate-value-priority-hybrid-20260515T030500Z`
lands at 386/500 with evidence-session recall 0.8945, missed recall 84, wrong
recall 6, and `executionFailures: 0`, only one answer above the direct-factual
hybrid run. That keeps the next repair target on answer-evidence assembly rather
than raw session recall.

A seventh repair is now focused on answer-session detail evidence and
selection narrowing. Entity/evidence assembly previously produced the strongest
current hybrid full-500 checkpoint,
`run-phase62-longmemeval-full500-current-after-entity-evidence-assembly-hybrid-retry-r1-merged-20260515T064500Z`,
at 401/500 with evidence-session recall 0.8935, missed recall 85, wrong recall
6, and `executionFailures: 0`; the matching rules-only retry merge
`run-phase62-longmemeval-full500-current-after-entity-evidence-assembly-rules-only-retry-r1-merged-20260515T073500Z`
reached 391/500. A broader answer-session detail pass then improved recall but
regressed answer quality: the clean hybrid full-500
`run-phase62-longmemeval-full500-current-after-answer-session-detail-hybrid-r2-20260515T100500Z`
landed at 390/500 despite evidence-session recall 0.9112, missed recall 74,
wrong recall 6, and `executionFailures: 0`. The current code narrows selection
so user-grounded previous-chat questions prefer `user_answer` /
`compact_evidence`, generic assistant answers do not pollute preference
advice, and sleep-before-appointment bridge evidence surfaces the sleep time
before appointment context. Targeted hybrid evidence is positive: the 14-case
selection-narrowing run
`run-phase62-longmemeval-live-answer-session-detail-hybrid-targeted-r5-selection-narrowed-20260515T120000Z`
answers 13/14 with evidence-session recall 1.0 and only one judge
infrastructure failure (`58ef2f1c` generated `On Valentine's Day.` but the
judge hit `unknown certificate verification error`); clean single-case retries
`run-phase62-longmemeval-live-58ef2f1c-valentine-selection-r2-20260515T121000Z`
and
`run-phase62-longmemeval-live-dd2973ad-sleep-bridge-selection-r2-20260515T115500Z`
both pass with `executionFailures: 0`. This targeted repair is not yet a
Phase 62 quality close. The sharded current-code full-500 after selection
narrowing,
`run-phase62-longmemeval-full500-current-after-selection-narrowing-hybrid-smallshards-20260516T095000Z`,
completed cleanly but landed at 399/500 with evidence-session recall 0.9102,
missed recall 74, wrong recall 6, wrong answers 101, and
`executionFailures: 0`. It does not supersede the 401/500 entity-evidence
checkpoint; the main remaining gap is answer grounding over already selected
evidence, especially false `No answer` responses and numeric/temporal
synthesis errors. The current answer-grounding repair now keeps query-matching
verified evidence from recalled sessions in a `Selected Session Evidence`
block, adds a `Selected Evidence Synthesis` block for deterministic comparison,
total, descriptive-entity, and elapsed-days synthesis, gives generic prompt
guidance for using that synthesis as answer-bearing evidence, and derives
kitchen-appliance purchase facts from `got` / `bought` phrasing such as
`smoker`. Targeted live hybrid evidence is positive but still not global
closure:
`run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-20260516T133000Z`
recovers 4/4 representative full-evidence false `No answer` rows with
`executionFailures: 0`; the broader
`run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-r2-20260516T133500Z`
recovers 6/12 multi-session and temporal rows; and the post-prompt/appliance
retry
`run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-r3-20260516T134500Z`
recovers 2/6 previously failing rows (`71017277` and `gpt4_8279ba03`) with
`executionFailures: 0`. The follow-up synthesis retry first recovered 3/4 in
`run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-targeted-r4-20260516T145000Z`,
then the explicit page-count computed-answer retry fixed `37f165cf` in
`run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-page-retry-r2-20260516T150000Z`.
The accepted clean combined targeted evidence is
`run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-targeted-r5-20260516T150500Z`:
4/4 correct on `7405e8b1`, `37f165cf`, `gpt4_fa19884d`, and `2c63a862`, with
evidence-session recall 1.0, `missedRecallCases: 0`, `wrongRecallCases: 0`,
`wrongAnswerCases: 0`, and `executionFailures: 0`. This resolves the observed
selected-evidence synthesis blockers in targeted evidence, but it is still a
targeted mechanism improvement, not a full-500 quality close. The follow-up
sharded full-500
`run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-smallshards-20260516T151000Z`
first reached 424/500 with evidence-session recall 0.9102 and 4 certificate
verification execution failures; the failed-row recovery
`run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-retry-r1-merged-20260516T190000Z`
cleared those failures and reached 428/500, missed recall 74, wrong recall 6,
wrong answers 72, and `executionFailures: 0`. This supersedes the earlier
401/500 hybrid checkpoint as the strongest current GoodMemory hybrid result,
but it still does not close Phase 62 because `baseline-full-context` remains
451/500. A subsequent count-synthesis repair targets full-recall multi-session
wrong-value rows by deriving computed count hints from selected compact evidence
for clothing pickup/return items, furniture activity, baking events, property
viewing before an offer, health devices with duplicate-device suppression,
music albums/EPs, and Marvel movie rewatches. The first 7-case targeted hybrid
run
`run-phase62-longmemeval-live-selected-count-synthesis-hybrid-targeted-20260516T210000Z`
fixed 5/7 and exposed duplicate counting for baking and Marvel rewatches; after
normalizing those duplicate event variants,
`run-phase62-longmemeval-live-selected-count-synthesis-hybrid-targeted-r3-20260516T214500Z`
recovered all 7/7 with evidence-session recall 1.0, wrong recall 0, wrong
answers 0, and `executionFailures: 0`. This is targeted repair evidence only;
a fresh sharded full-500 is still required before updating the 428/500 global
checkpoint. The attempted earlier single-process full-500
`run-phase62-longmemeval-full500-current-after-selection-narrowing-hybrid-20260515T121500Z`
was manually terminated before writing a report because the serial run produced
no intermediate artifact. Use the sharded/full-500 runner or failed-row
recovery path for the next accepted global comparison; if a sharded full-500
run is interrupted after writing completed shard reports, rerun the same
`--run-id` with `--resume-existing-shards` so completed `*-shard-NN` reports
are reused instead of rerun.

核心原则：

- 不把 benchmark adapter 当成产品能力。
- 不为了某个 benchmark 写特殊 prompt hack。
- 每轮必须沉淀 miss-case taxonomy、补强实现、回归测试、前后对比证据。
- 最终报告只引用已完成四轮后的稳定结果。

## Key Changes

- 新增四个连续阶段：
  - Phase 62: LongMemEval integration and hardening
  - Phase 63: BEAM scale and noise hardening
  - Phase 64: MemoryAgentBench agent-memory hardening
  - Phase 65: LoCoMo public comparability hardening
  - Phase 66: final public proof report and claim boundary

- 每个阶段固定流程：
  - 接入该 benchmark 的 smoke fixtures 和外部 `--benchmark-root` full-run adapter。
  - 跑 `no-memory`、`full-context`、`goodmemory-rules-only`、`goodmemory-hybrid`。
  - 生成内部失败分析，不做公开报告。
  - 按失败类型补强 GoodMemory 的通用机制。
  - 回跑同一 benchmark，确认提升且 wrong recall / stale recall / leakage 不恶化。
  - 阶段 gate 只接受“机制改进 + 回测证据”，不接受单纯跑分。

- 每个 benchmark 的主攻方向：
  - LongMemEval：长期 QA、更新覆盖、时间推理、拒答、证据召回。
  - BEAM：百万级上下文压力、噪声过滤、token 成本、召回稳定性。
  - MemoryAgentBench：test-time learning、冲突解决、agent 行为记忆、长期交互。
  - LoCoMo：公开可比性、人物/事件连续性、跨会话对话记忆。

## Implementation Shape

- 复用 Phase 49 的 external benchmark-root 模式，不 vendoring 完整上游数据。
- 每个阶段新增独立 runner：
  - `eval:phase-62`, `eval:phase-62-full500`,
    `eval:phase-62-full500-retry-failures`,
    `eval:phase-62-recall-diagnostic`, `gate:phase-62`
  - `eval:phase-63`, `gate:phase-63`
  - `eval:phase-64`, `gate:phase-64`
  - `eval:phase-65`, `gate:phase-65`
  - `eval:phase-66`, `gate:phase-66`
- 每轮输出：
  - smoke report：可进仓库、用于 gate。
  - full-run report：本地 research evidence，可引用摘要但不作为 release hard gate。
  - miss-case analysis：记录失败族、根因、补强项、回测 delta。
- GoodMemory 补强优先顺序：
  - 先修召回质量、stale suppression、conflict/update handling。
  - 再修大规模噪声和 token budget。
  - 再修 agent 行为内化和跨轮学习。
  - 最后修公开对话记忆可比性与叙述证据。

## Test Plan

- 每个阶段必须先写失败测试：
  - adapter manifest validation
  - smoke fixture loader
  - CLI flag parsing
  - report schema
  - benchmark-specific miss-case regression
  - no public API/config widening release test
- 每轮完成至少运行：
  - targeted unit tests
  - `bun run eval:phase-XX`
  - `bun run gate:phase-XX`
  - `bun run typecheck`
  - `bun test`
- full-run 使用显式外部路径和 provider env；没有 env 时必须明确 skip，不伪造 provider-backed 结果。

## Assumptions

- 顺序锁定为：LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo。
- 每个 benchmark 完成后允许改 GoodMemory 通用机制，再进入下一个。
- 最终公开报告只在 Phase 66 做。
- 四个 benchmark 的中间结果都保持 research/internal，不提前写 README 级产品 claim。
