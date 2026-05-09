# Sequential Benchmark Hardening Plan

## Summary

按顺序推进四个外部基准：LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo。每个基准都独立成一个工程阶段：先接入和跑通，再做失败分析，再补强 GoodMemory，最后用同一基准回测确认提升。最终报告放到全部四轮打磨完成之后，不提前做公开结论。

Current execution status: Phase 62 LongMemEval is still active. The current-code
full-500 execution blocker is clean after failed-row recovery:
`run-phase62-longmemeval-full500-current-after-generic-count-gpt55-hybrid-r1-merged-20260509T022500Z`
has all four profiles across 500 cases with `executionFailures: 0`. The
full-500 quality gap remains open: `baseline-full-context` is 461/500 (92.2%),
`goodmemory-rules-only` is 363/500 (72.6%, evidence-session recall 0.7754), and
`goodmemory-hybrid` is 361/500 (72.2%, evidence-session recall 0.7734).
Runtime AI SDK retry now treats socket-closed, `model_cooldown`, and
usage-limit provider errors as transient; the failed-row runner also supports
serial `--batch-delay-ms` throttling plus `--exclude-case-id` / `--skip-case-id`
for temporary provider-stuck bypasses. BEAM remains blocked until the remaining
LongMemEval full-500 quality gap is repaired or explicitly deferred.

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
