# GoodMemory Recall Selection Architecture

本文档记录 `src/recall/selection.ts` 与 `src/recall/selectors/` 的当前设计。它描述已经落地的召回选择架构，不是 Phase 63 提分计划，也不是新的 public API 提案。

## Purpose

`selection.ts` 的职责是召回事实选择的编排层：

- 接收事实候选、查询、语言服务、routing decision、profile、reference time 和语义分。
- 构建 ranked candidate stream 与 trace map。
- 调用 `selectionRunContext.ts` 计算查询级别的 selector flags 与候选池。
- 按显式顺序运行 primary selectors。
- 在 primary selector 后追加少量 companion evidence。
- 产出 `ScoredMemory<FactMemory>[]` 并标记 trace。

领域规则不应继续堆在 `selection.ts`。规则、regex、候选优先级和 selector family 内部 helper 应放在 `src/recall/selectors/`。

## Public Boundary

外部调用方仍然只依赖 `src/recall/selection.ts`。

当前 public surface 保持不变：

- `selectFacts`
- `selectFeedback`
- `selectFeedbackForProfile`
- `selectFeedbackForQuery`
- `selectPreferencesForQuery`
- `selectReferences`
- `selectEpisodes`
- `selectArchives`

`src/recall/selectors/` 是 recall selection 的内部实现目录。调用方不应直接导入 selector module，除非它本身属于 recall selection 内部边界。

## Internal Shape

`selection.ts` 是薄 orchestration layer。它可以包含候选流组织、selector 仲裁、append selector 编排和结果 materialization，但不应持有大量领域规则。

`selectionRunContext.ts` 是 fact selection 的 run-context builder。它集中 query detector、selector 候选池和 append suppression 所需的布尔状态。`selection.ts` 不应直接 import 具体业务或 benchmark query detector。

`selectionRunContext.ts` 不能变成新的预计算大桶。reference-only、slot-specific 和明确 abstention 的查询路径应返回空候选上下文，避免在已经能短路的请求上预计算 summary、timeline、information extraction、reasoning 等重 selector 候选池。

`selectionSlot.ts` 放 slot-specific fact selection。slot 选择是 orchestration 的稳定子流程，不应和 source-order、aggregate、temporal 等领域 selector 混在同一个文件里。

`selectors/selectionContext.ts` 放共享的内部 primitives：

- trace 标记包装。
- tag 判断。
- evidence prefix 清理。
- slot/text helper。
- 少量跨 selector 的 recall limits 与 common patterns。

`selectors/topic.ts` 放 selector 共享的 topic tokenization 与 overlap helper。语言无关的 topic 提取优先放这里；更通用的语言能力后续应迁到 `src/language/`。

`selectors/recordSelection.ts` 放非 fact 的 record selectors：

- feedback
- preference
- reference
- episode
- archive

`selectors/aggregate.ts` 放聚合类事实选择：

- count
- money
- numeric facts
- comparative evidence
- category instance aggregation

`selectors/temporal.ts` 放通用时间类判断：

- interval query
- event order query
- most recent query
- source-order sort key
- dated fact chronology

`selectors/sourceEnvelope.ts` 是唯一允许识别 imported source envelope 的 runtime 文件。`external_benchmark`、`BEAM` 这类来源包络字面量只能在这里出现，不能进入 `selection.ts` 或具体 selector family。

`source_order` tag 是结构元数据，不是内容相关性的充分证据。通用 temporal selector 只能把 imported source envelope 的 source-order evidence 当作 source-ordered temporal fallback；普通 source-ordered memory 仍必须通过 intent、lexical、subject、date、aggregate 或其他内容信号。

`selectors/sourceOrderInstruction.ts` 放 source-ordered instruction 与 preference evidence。偏好和指令 topic helper 位于 `selectors/sourceOrderRules/preferenceRules.ts` 与 `selectors/sourceOrderRules/instructionTopics.ts`，由 instruction selector 显式 re-export 兼容旧内部调用。

`selectors/sourceOrderSummary.ts` 放 source-ordered conversation summary coverage。命名实体和技术挑战子规则位于 `selectors/sourceOrderRules/summaryNamedEntity.ts` 与 `selectors/sourceOrderRules/summaryTechnicalChallenge.ts`。

`selectors/sourceOrderTemporal.ts` 放 source-ordered temporal gap fill、companions、milestones 和 personal-work-challenge evidence。temporal shared helpers 与 fill logic 位于 `selectors/sourceOrderRules/temporalShared.ts` 与 `selectors/sourceOrderRules/temporalFill.ts`。

`selectors/sourceOrderTimeline.ts` 放 timeline integration evidence 的聚类、排序和选择。

`selectors/sourceOrderInformationExtraction.ts` 放 source-ordered information extraction evidence。query matching 由 `selectors/sourceOrderRules/informationExtractionQueryRules.ts` 的静态 rule table 驱动，不再用 `isXQuery + hasXEvidence` 的成对函数链堆在 selector 主文件里。

`selectors/sourceOrderReasoning.ts` 是 reasoning selector 的薄 facade。具体 reasoning rules 位于 `selectors/sourceOrderRules/reasoningRules.ts`，通用 reasoning bridge 位于 `selectors/sourceOrderRules/reasoningBridgeRules.ts`。

`selectors/sourceOrderRules/` 放 source-order selector family 的静态规则表和拆分后的子领域规则。文件名和 rule id 必须使用通用领域名，例如 `relationshipFinancialManagementSummary.ts`、`academic-mentor`、`current-housing-rent`，不能用具体人名、地点或 benchmark fixture 名做 runtime selector 文件名、函数名、facet id 或 rule id。

`selectors/conversationEvidence.ts` 放对话证据桥接：

- assistant answer evidence
- user-grounded evidence
- preference advice bridge
- direct factual bridge
- research recommendation
- coupon redemption context

`selectors/contradiction.ts` 放 contradiction confirmation 的正反证据配对。对具体技术栈的识别只能作为 domain evidence pattern 存在，不能把函数名或 orchestration import 命名成某个 benchmark case。

`selectors/updateSeries.ts` 放 update-history collapse、series key 和 update companion selection。query detector 位于 `selectors/updateSeriesQueries.ts`，避免 update selector 主文件继续膨胀。

## Selection Flow

事实候选的基础排序仍由 recall scoring 负责。`selection.ts` 在 ranked candidate stream 之上做选择仲裁。

Primary selector 顺序由 `PRIMARY_FACT_SELECTION_ORDER` 显式表达。当前顺序是：

```text
contradiction_evidence_pair
source_ordered_information_extraction
aggregate_evidence
source_ordered_personal_work_challenge
source_ordered_temporal_interval
source_ordered_summary
source_ordered_timeline
source_ordered_reasoning_bridge
conversation_evidence
preference_evidence
update_evidence
temporal_bridge
direct_factual_bridge
temporal_order
intent_signal
lexical_or_subject_signal
research_recommendation
answer_or_confirmation
coding_agent_fallback
```

这个顺序是行为的一部分。重排它等价于修改召回行为，必须有 focused regression test 支撑。

Primary selector 采用 first handled wins：

- selector 返回 handled 后，primary loop 结束。
- selector 未命中时，后续 selector 才有机会运行。
- 这保留了重构前 `if / else if` 的语义，但让优先级可读。

Append selector 在 primary path 后运行，只用于补足已有主路径结果所需的 companion evidence，例如 source instruction、source preference、assistant count heading 和 direct factual companions。append selector 不能悄悄变成第二套 primary arbitration。

Trace 标记通过 `markSelectedTrace` 和 `selectAndTrace` 集中处理。selector module 返回候选，orchestration layer 负责 selected set、dedupe 和 trace reason。

Benchmark/source-envelope handling is not a selector family. Runtime selection can ask whether a candidate is imported source-ordered evidence through `isSourceEnvelopeCandidate(entry)` or generic source-message tags. It cannot branch on `entry.fact.category === "external_benchmark"` outside `sourceEnvelope.ts`.

## Localization Boundary

当前设计支持多语言扩展，但不能宣称 `selection.ts` 已经完全多语言。

原则：

- 中文、英文或其他语言的 selector-specific pattern 应放在拥有该规则的 selector module 内。
- `selection.ts` 不再继续堆中文 regex 或英文特化 regex。
- `topic.ts` 负责 selector 层共用的 tokenization 和 Han-compatible topic overlap。
- 可复用、跨模块的语言能力应进入 `src/language/`，不要放进 selector 目录的临时 helper。
- 多语言能力必须用具体 detector 和测试证明，不用 `LanguageService` 的存在替代证明。

例如 source-ordered summary 的中文 milestone pattern 属于 summary/source-order rule module，source-ordered instruction 的偏好和指令别名属于 instruction rule module，不属于 `selection.ts`。

## Design Rules

必须保持这些约束：

- 不改变 `selectFacts` 和 record selector 的 public signatures。
- 不改变 `RecallCandidateTrace` 对外结构。
- 不在 selector 层引入 plugin registry、DSL 或 runtime config engine。
- 机械拆分不能顺手调整 BEAM scoring、threshold 或排序策略。
- selector family 自己拥有自己的 rule constants、regex 和 priority helper。
- `selection.ts` 不能 import `is*Query` 这类具体 query detector；query flags 必须先进入 `selectionRunContext.ts`。
- `selection.ts` 不能出现 `external_benchmark`、`BEAM` 或具体 benchmark case 名。
- runtime selector 文件名不能包含具体人名或明显 benchmark fixture 名。
- runtime selector 规则正文不能保留具体 benchmark 人名、地点名或 fixture slug；需要用领域语义、事件结构、时间边界、角色、金额、地点类型等可泛化锚点表达。
- benchmark-specific runtime selector 是禁止项；无法泛化的 fixture 逻辑应留在测试构造或被归入通用 rule family。
- source-order rules 必须归入通用 family，规则 id 使用领域名，不使用具体人名。
- `source_order` 不能作为普通 temporal relevance 的充分条件；除非候选通过 `isSourceEnvelopeCandidate(entry)` 被识别为 imported source envelope，否则还需要内容相关信号。
- `selectionContext.ts` 只能放跨 selector 的共享 primitives，不能变成新的规则垃圾桶。
- `src/recall/selectors/` 不使用 `export * from` barrel。
- 不恢复 `factSelection.ts` 或 `sourceOrder.ts` 这种过宽的聚合模块。

## Regression Guardrails

`tests/unit/architecture.boundaries.test.ts` 负责保护当前架构形状：

- `src/recall/selection.ts` 不超过 900 行。
- 单个 selector module 不超过 900 行。
- `src/recall/selectors` 顶层 `.ts` 文件不超过 35 个。
- `src/recall/selectors` 顶层 `sourceOrder*.ts` 文件不超过 25 个。
- 不存在 `src/recall/selectors/factSelection.ts`。
- 不存在 `src/recall/selectors/sourceOrder.ts`。
- selector 目录不使用 wildcard barrels。
- `selection.ts` 不 import 具体 `is*Query` detector。
- `selection.ts` 不出现 source-envelope literal 或 benchmark case literal。
- runtime selector 文件名不使用具体 fixture/person 名。
- runtime selector source 不出现具体 fixture/person/location literal，`sourceEnvelope.ts` 除外。
- 普通 non-imported `source_order` 候选不会仅凭结构 tag 进入 temporal-order selection。

召回选择相关改动至少运行：

```bash
bun test tests/unit/architecture.boundaries.test.ts
bun test tests/unit/recall.selection.test.ts
bun test tests/unit/recall.scoring.test.ts tests/unit/recall.router.test.ts
bun run typecheck
```

Phase 63 相关改动还应按风险运行：

```bash
bun test tests/unit/run-phase-63.beam-recall-diagnostic.test.ts
bun test tests/unit/language/service.test.ts
```

## Non-Goals

这次架构不解决这些问题：

- 不把 selector 做成插件系统。
- 不把规则迁到配置引擎。
- 不重写 recall scoring。
- 不改变 public API。
- 不把 `src/language/` 已有职责复制到 selector layer。
- 不借架构拆分修 benchmark 分数。

## When Adding a Rule

新增 selector rule 时按这个顺序做：

1. 先判断它属于哪个 selector family。
2. 先写或更新 focused regression test。
3. 把 rule constants、regex、priority helper 放进拥有该领域的 selector module。
4. 只有 selector 仲裁顺序真的变化时才改 `selection.ts`。
5. 如果中文或其他语言 pattern 是规则的一部分，把 multilingual rule group 放在同一 selector module 内。
6. 如果规则跨多个 selector 复用，优先考虑 `topic.ts` 或 `src/language/`，不要塞进 `selectionContext.ts`。
7. 如果规则来自 imported source envelope，只通过 `sourceEnvelope.ts` 暴露通用判断，不把 source name 泄漏到 selector family。
8. 如果新模块接近 900 行，继续按子领域拆分，而不是扩大现有模块。
