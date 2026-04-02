# GoodMemory TDD and Evaluation Strategy

> Execution strategy for building GoodMemory with TypeScript + Bun using TDD from day one.
> Companion documents: [GoodMemory-PRD.md](./GoodMemory-PRD.md), [GoodMemory-OSS-Architecture-v1.md](./GoodMemory-OSS-Architecture-v1.md), [GoodMemory-First-Principles-and-Reference-Architecture.md](./GoodMemory-First-Principles-and-Reference-Architecture.md)

**Status:** Draft  
**Runtime:** Bun  
**Language:** TypeScript  
**Development style:** TDD first, product eval always-on

---

## 1. 文档目标

这份文档不定义产品是什么，而定义：

- 如何用 TDD 去实现 GoodMemory
- 测试体系如何分层
- 产品级评测集如何设计
- 什么算“可验证”的 memory layer
- 如何把“更好回答”转化为可回归、可比较的结果

GoodMemory 的关键要求不是“能跑”。

而是：

> 在持续迭代后，依然能证明它让 LLM 对用户理解得更好，并且回答得更好。

---

## 2. 开发原则

### 2.1 TDD 是默认开发方式

每个能力必须按以下顺序推进：

1. 写失败测试
2. 写最小实现让测试通过
3. 重构实现
4. 跑该模块全测试
5. 跑产品级回归评测的相关子集

任何 feature 都不能先写实现再“补测试”。

### 2.2 产品评测不是上线前才做

GoodMemory 的产品价值依赖：

- recall 是否更准
- user understanding 是否更强
- historical continuity 是否更稳

因此完整评测集必须从一开始就建立。

它不是 release 前的附加检查，而是持续开发中的主反馈系统。

### 2.3 核心逻辑与产品效果分开验证

我们需要区分两类正确性：

1. **逻辑正确性**
   taxonomy、routing、merge、budget、policy、maintenance 等算法层是否正确。
2. **产品正确性**
   使用 GoodMemory 后，LLM 是否真的对用户理解得更好、承接任务更好。

这两类测试必须同时存在。

---

## 3. 技术约束

### 3.1 运行时与语言

- Runtime: Bun
- Language: TypeScript
- Test runner: Bun test
- Assertion / mocking: 优先使用 Bun 原生能力，必要时补轻量依赖

### 3.2 测试的两种执行模式

#### Local deterministic mode

用于：

- unit tests
- integration tests
- scenario tests

要求：

- 尽量不依赖外部模型 API
- 可在 CI 中稳定执行
- 能快速反馈

#### Live evaluation mode

用于：

- 产品级完整评测集
- baseline vs GoodMemory A/B
- LLM-as-judge 主评测

要求：

- 允许真实外部模型 API
- 单独命令执行
- 结果持久化
- 支持多次 rerun 比较

### 3.3 允许的测试策略

你已经明确锁定：

- 主评测以 **LLM-as-judge** 为主
- 数据为 **结构化 persona spec + 合成对话 replay**
- live API **全部允许**

因此测试体系设计要围绕这三点展开，而不是继续争论评测方法论。

---

## 4. 测试分层

GoodMemory v1 采用 4 层测试体系。

## 4.1 Unit Tests

验证局部逻辑和纯函数行为。

覆盖范围：

- memory taxonomy 分类
- write policy
- dedupe / supersede / reject
- conflict resolution
- retrieval planning
- context budgeting
- output serialization
- stale memory verification decision
- maintenance rule logic

目标：

- 高稳定性
- 高覆盖率
- 无需真实模型 API

## 4.2 Integration Tests

验证核心组件协同工作。

覆盖范围：

- `createGoodMemory()`
- `recall()`
- `buildContext()`
- `remember()`
- `feedback()`
- `forget()`
- storage adapter 行为一致性

目标：

- 在 Bun + TypeScript 环境中验证系统主链路
- 发现跨模块 contract 问题

## 4.3 Scenario Tests

验证单个 persona 的生命周期行为。

覆盖范围：

- 一个 persona 的多轮对话 replay
- profile / fact / episode / procedural memory 如何演化
- recall 是否承接了过去的重要信息
- 用户纠正后系统是否行为改变

目标：

- 比 unit/integration 更接近真实产品行为
- 但仍保持结构化和较强可控性

## 4.4 Product Evaluation Suite

这是 GoodMemory 最重要的测试层。

覆盖范围：

- 约 40 个独立 persona
- 中等生命周期样本为主
- 少量长期生命周期样本
- baseline vs GoodMemory A/B
- LLM-as-judge 产品评分

目标：

- 验证产品是否真的带来更强用户理解与连续性
- 提供回归指标，防止版本升级后能力退化

---

## 5. Persona 数据集设计

## 5.1 数据集目标

每个 persona 不是一句“我是程序员”。

而是一个可持续 replay 的独立个体。

每个 persona 至少包含：

- `persona_id`
- `name`
- `age_range`
- `locale`
- `profession`
- `expertise`
- `background`
- `communication_preferences`
- `work_style_preferences`
- `long_term_goals`
- `current_projects`
- `growth_path`
- `known_relationships`
- `memory_risks`

其中：

- `growth_path` 用于表达身份/能力/目标如何随时间变化
- `memory_risks` 用于制造冲突、漂移、遗忘和验证需求

## 5.2 样本结构

建议 40 个 persona 的配比：

- 28 个中等生命周期 persona
- 8 个中等偏复杂 persona
- 4 个长期生命周期 persona

### 中等生命周期 persona

建议：

- 8-15 轮对话
- 2-4 个会话
- 明确身份背景
- 至少 1 个历史任务
- 至少 1 个开放问题

### 长期生命周期 persona

建议：

- 20-40 轮对话
- 5-8 个会话
- 至少 1 条身份变化或目标变化
- 至少 1 次显式纠正
- 至少 1 次过期记忆场景

## 5.3 对话设计原则

对话必须覆盖：

- 用户显式透露身份/背景
- 用户隐式暴露偏好
- 历史任务延续
- 开放问题回访
- 新信息与旧信息冲突
- 用户纠正系统
- 用户确认系统某种做法是对的

这能同时测试：

- semantic memory
- episodic memory
- procedural memory
- stale verification

---

## 6. 主评测目标

你已经明确 v1 的主目标是两项：

1. **更好识别用户身份 / 背景**
2. **更好承接历史任务 / 开放问题**

因此产品评测也必须围绕这两项主目标组织。

## 6.1 Identity / Background Understanding

判断重点：

- 模型是否正确识别用户职业、经验、背景
- 模型是否记住和使用对未来仍然有价值的用户信息
- 模型是否减少要求用户重复背景信息
- 模型是否把 stale / 无关信息误当成当前事实

## 6.2 Historical Task / Open Loop Continuation

判断重点：

- 模型是否能承接历史任务上下文
- 模型是否能识别未解决问题
- 模型是否能在后续会话中继续推进，而不是重新开始
- 模型是否遗漏关键历史决策

## 6.3 次级评测目标

可作为辅助指标：

- 是否更稳定地遵循用户偏好
- 是否正确使用 procedural memory
- token 成本是否下降
- recall 噪声是否降低

---

## 7. LLM-as-Judge 评测框架

## 7.1 为什么采用 LLM-as-Judge

因为主评测目标本身不是简单规则可以完整覆盖的。

例如：

- “更好理解用户背景”
- “更好承接历史任务”

这些需要语义层判断。

因此采用：

- 规则校验做底线约束
- LLM-as-judge 做主评分

## 7.2 Judge 输入

每个测试样本的 judge 输入至少包括：

- persona spec
- 本轮用户输入
- 历史会话摘要或标准上下文
- baseline 回答
- GoodMemory 回答
- 评分 rubric

## 7.3 Judge 输出

建议每次 judge 输出：

```ts
interface JudgeResult {
  winner: "baseline" | "goodmemory" | "tie";
  scores: {
    identity_understanding: number;
    history_continuation: number;
    factual_alignment: number;
    relevance: number;
    personalization?: number;
  };
  reasoning: string;
  failure_tags: string[];
}
```

## 7.4 Judge Rubric

核心 rubric 建议固定为：

- `identity_understanding`
  是否正确理解并利用用户身份、背景、专业能力与当前处境
- `history_continuation`
  是否正确承接历史任务、开放问题与 prior decisions
- `factual_alignment`
  是否没有虚构、错用或误读 memory
- `relevance`
  是否引用了真正相关的 memory，而不是噪声

附加 rubric：

- `personalization`
  是否更符合用户偏好的风格和协作方式

---

## 8. A/B 回归测试设计

## 8.1 两个系统

每个产品评测样本必须跑两个系统：

### Baseline

- 不接入 GoodMemory
- 只给当前会话必要上下文

### GoodMemory

- 接入 GoodMemory
- 使用 `recall()` + `buildContext()` + `remember()` + `feedback()`

## 8.2 每个样本的评测流程

```text
load persona spec
  ↓
replay historical conversations
  ↓
baseline system answers current prompt
  ↓
goodmemory system answers current prompt
  ↓
judge compares outputs
  ↓
persist score + trace + failure cases
```

## 8.3 必须保存的调试材料

每个样本至少保存：

- baseline answer
- GoodMemory answer
- recalled memories
- built context
- write trace
- feedback trace
- judge result

这样失败时才可调试。

---

## 9. 回归输出格式

每次完整产品评测至少输出 4 类结果。

## 9.1 总分与分项分数

例如：

- overall score
- identity understanding score
- history continuation score
- relevance score
- factual alignment score

## 9.2 Persona 失败案例

至少列出：

- 哪个 persona 失败
- 失败在哪个维度
- baseline 和 GoodMemory 的回答差异
- judge 的 reasoning

## 9.3 Memory traces

至少列出：

- remember traces
- recall traces
- feedback traces
- context build traces

## 9.4 A/B 对比

必须能回答：

- GoodMemory 比 baseline 平均提升多少
- 哪些 persona 提升最大
- 哪些场景反而变差

---

## 10. 建议的仓库测试结构

建议从一开始就按测试分层建目录。

```text
src/
  core/
  runtime/
  memory/
  retrieval/
  context/
  maintenance/
  adapters/
tests/
  unit/
  integration/
  scenarios/
  eval/
fixtures/
  personas/
  conversations/
  rubrics/
reports/
  eval/
scripts/
  run-eval.ts
  summarize-eval.ts
```

### `fixtures/personas/`

存 persona spec。

### `fixtures/conversations/`

存合成对话 replay 数据。

### `fixtures/rubrics/`

存 judge rubric 模板。

### `reports/eval/`

存每次 live eval 结果。

---

## 11. TDD 实施顺序

建议按产品风险排序，而不是按模块表面顺序排序。

## Phase 0: Test Harness First

先完成：

- Bun + TypeScript 基础工程
- Bun test 配置
- 测试目录结构
- fixtures 目录结构
- 统一 test utilities
- LLM-as-judge runner 骨架
- eval report 输出结构

没有这些，不进入业务开发。

## Phase 1: Pure Logic First

先写 unit tests，再做：

- taxonomy
- merge / supersede
- conflict handling
- routing
- verification decisions
- budgeting

## Phase 2: Core API Chain

先写 integration tests，再做：

- `createGoodMemory()`
- `recall()`
- `buildContext()`
- `remember()`
- `feedback()`
- `forget()`

## Phase 3: Scenario Layer

先写 scenario tests，再做：

- persona replay
- cross-session continuity
- open-loop continuation
- procedural memory updates

## Phase 4: Product Eval Layer

先写 eval harness 和 40 persona 数据，再跑：

- baseline vs GoodMemory
- judge scoring
- regression reporting

---

## 12. 每类测试必须先写什么

## 12.1 Unit test 先验测试

每个能力开发前先写：

- input
- expected memory state
- expected recall selection
- expected context output
- expected verification decision

## 12.2 Integration test 先验测试

每个主 API 开发前先写：

- happy path
- conflict path
- stale path
- no-memory path
- delete/correction path

## 12.3 Scenario test 先验测试

每个 persona 场景开发前先写：

- 初始 persona spec
- replay conversations
- expected remembered facts
- expected recalled items
- expected answer properties

## 12.4 Eval test 先验测试

每个产品评测样本开发前先写：

- baseline prompt package
- GoodMemory prompt package
- judge rubric
- expected improvement hypothesis

---

## 13. 风险与控制

### 风险 1：LLM-as-judge 不稳定

控制：

- rubric 固定
- judge prompt 固定
- 保存 reasoning
- 允许 rerun 比较
- 对关键样本支持多次采样

### 风险 2：合成 persona 太假

控制：

- persona spec 必须结构化
- 职业、背景、成长路径必须足够具体
- 样本覆盖不同风险场景
- 后续允许加入脱敏真实 replay

### 风险 3：live eval 太贵

控制：

- unit/integration/scenario 先本地跑
- eval 独立命令执行
- 支持 smoke eval 与 full eval
- 优先回归失败子集

### 风险 4：只优化 judge 分数，不优化真实产品

控制：

- 保留 baseline 对比
- 保存失败案例人工抽查
- 把 identity/history 两项主指标锁死，不频繁改 rubric

---

## 14. 最终结论

GoodMemory 这种产品，如果没有从第一天就建设：

- TDD
- scenario tests
- persona replay
- baseline vs GoodMemory A/B
- LLM-as-judge 产品评测

最后一定会退化成“能跑，但无法证明变好”的系统。

所以对 GoodMemory 来说，测试不是支持性工程。

它就是产品本身的一部分。
