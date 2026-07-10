# GoodMemory Recall Selection Architecture

本文档描述 Phase 68 之后的当前召回选择边界。历史 fitted selector 的行为证据仍可复现，但不再属于生产架构。

## Production Boundary

生产入口是 `src/recall/selection.ts`。它只负责：

- 导出稳定的 fact/record selector surface。
- 默认分发到 `selectGeneralizedFactsForInternalUse`。
- 保留一个不从 package root 导出的 repo-eval 注入点，供历史 profile 激活。

通用事实选择实现在 `src/recall/generalizedSelection.ts`。生产默认不读取环境变量，也不导入 narrow gate、source-order rule table、benchmark query classifier 或 legacy route table。

`src/recall/selectors/` 只保留五个通用模块：

- `recordSelection.ts`：feedback、preference、reference、episode、archive。
- `selectionContext.ts`：trace、tag、slot 和通用候选信号。
- `sourceEnvelope.ts`：导入来源包络识别。
- `temporal.ts`：通用时间和用户事件顺序判断。
- `topic.ts`：通用 topic token helper。

`src/recall/factSelection/` 只保留四个通用基础模块：

- `contracts.ts`
- `draft.ts`
- `entityUnion.ts`
- `semanticUnion.ts`

`selectionSlot.ts` 继续拥有 role、focus、blocker、open-loop 和 project-state-support 的 slot 选择。

## Generalized Flow

生产事实选择按以下顺序执行：

1. 使用 `scoring.ts` 构建并排序候选与 trace。
2. 过滤 inactive 和 locale-incompatible 事实。
3. 对纯 reference 查询默认不返回事实；当查询明确表示“执行前检查 reference”时，允许相关 blocker/context 进入。
4. 对 slot query 使用 `selectionSlot.ts`，不进入通用 fact path。
5. 对 direct/count 查询折叠非 benchmark 类别的同 subject 旧值。
6. 对用户事件顺序查询排除 assistant-answer evidence。
7. 对 research recommendation 和 answer-composition 使用有界通用候选。
8. 其余查询按 lexical、subject、intent、explicitness 和 provider signal 选择，跨 session 去重，最多返回 6 条。
9. 必要时执行确定性的 zero-retrieval lexical fallback、同 session companion 和 semantic union。

这些机制只能依赖查询结构、事实元数据和通用语言信号，不能依赖 benchmark 人名、原句或 case id。

## Legacy Fitted Profile

历史 fitted graph 位于：

`scripts/eval-profiles/legacy-fitted/`

其中：

- `recall/` 保存历史 selector、narrow gates、source-order rules 和 route/augmenter graph。
- `recall/` 下的少量 proxy 只复用生产的 domain、language、scoring、draft、semantic-union 和 slot primitives，不复制实现。
- `activate.ts` 是唯一激活入口。
- `tests/` 保存历史行为契约。
- `gate-audit.json` 保存跨 BEAM 100K/500K/1M 的 148-gate census。

历史 profile 只能通过 repo 内脚本或以下命令显式运行：

```bash
bun run test:legacy-fitted
```

它没有公共配置、环境开关或 package export，且不进入 npm tarball。生产测试不得依赖该 profile 的全局 preload。

## Public And Package Boundary

包发布只包含编译产物与 JavaScript bin wrapper，不包含 `src`、TypeScript bin source 或 `scripts/eval-profiles`。

`selectFacts` 的内部签名、`RecallCandidateTrace` 结构和 GoodMemory 的公共 `recall` 结果保持兼容。legacy activation 不从 `src/index.ts` 或任何 package subpath 导出。

## Design Rules

必须保持以下约束：

- 不把 case-specific literal、proper noun 或 benchmark prompt 放回 `src/recall`。
- 不在生产 recall 中增加 narrow-gate 环境变量。
- 新机制必须先用 held-out slice 证明泛化，再进入生产。
- 提升不足 3pt或任一保护集回归超过 1pt时停止该 lever。
- 不以放宽 grounded abstention 换分。
- 不把世界知识写进 core memory；外部知识只属于显式 host/answer adapter。
- selector 只做候选选择，不复制 storage、answer generation 或 benchmark judge。
- 共享 primitive 留在 `src`；历史规则只留在 repo-only profile。

## Guardrails

`tests/unit/architecture.boundaries.test.ts` 与 Phase 68 gate 强制：

- `selection.ts` 不超过 300 行。
- 生产 `selectors/` 只能包含五个允许模块。
- 生产 `factSelection/` 只能包含四个允许模块。
- `src/recall` 不得出现 `narrowGates.ts`、`selectionLegacy.ts` 或 `selectionRunContext.ts`。
- 生产 recall 不读取 `process.env`。
- package 不包含 `src` 或 TypeScript entrypoint。
- compiled JavaScript 不包含已知 fitted benchmark literal。
- legacy census 必须完整覆盖 148 gates 和三个 BEAM split。
- generalized BEAM 100K baseline 必须是完整 400 问、零执行失败。

## Verification

生产选择改动至少运行：

```bash
bun test tests/unit/recall.generalizedSelection.test.ts
bun test tests/unit/recall.selection.invariants.test.ts
bun test tests/unit/recall.scoring.test.ts tests/unit/recall.router.test.ts
bun test tests/unit/architecture.boundaries.test.ts
bun run typecheck
```

涉及历史证据、gate census 或 Phase 63 复现时另跑：

```bash
bun run test:legacy-fitted
bun run scripts/list-scenario-gates.ts --pretty
bun run scripts/run-phase-68-generalization-gate.ts
```

## Adding A Retrieval Lever

1. 先定义目标 slice 与保护集。
2. 先写失败测试或可重放的测量。
3. 用通用索引、融合、预算、reranker 或 evidence policy 实现。
4. 不增加 literal rule。
5. 跑目标 slice；不足 3pt即停止。
6. 跑保护集；回归超过 1pt即回退。
7. 只有生产默认与 package boundary 都通过后，才更新 claim。
