# GoodMemory 对标 MemPalace 的分析与自进化增强计划

> Status: Reference analysis.  
> Canonical execution roadmap has moved to `docs/GoodMemory-Unified-Self-Evolving-Roadmap.md`.  
> This document remains as MemPalace-focused research input and design rationale.

> 目标：不是把 GoodMemory 改造成另一个 MemPalace，而是吸收它做得好的系统能力，并结合 GoodMemory 已有的可治理、可评测、可插拔优势，把 GoodMemory 推进为一个真正会“越用越强”的 memory layer。

## 1. 结论先行

MemPalace 做得好的根因，不在于某个单点算法，而在于它把 memory 做成了一个完整系统：

- 尽量保留原文证据，不在写入阶段过早丢信息
- 用 `wing / hall / room / tunnel` 做强结构化组织，而不是只靠向量检索
- 用 `L0 / L1 / L2 / L3` 做分层装载，控制 token 预算
- 用明确的 agent protocol 约束“何时查、何时写、何时修正”
- 用 benchmark miss case 反向推动检索策略持续迭代

GoodMemory 当前的优势与它不同：

- 数据模型更干净，typed memory 边界更明确
- `scope`、policy hooks、verification、export/delete 能力更适合成为真正的 memory layer
- `feedback` 已经是一等公民
- `maintenance`、`dream gate`、`eval harness` 已经有了骨架

因此，GoodMemory 不该复制 MemPalace 的“memory OS”形态，而应走这条路：

> 用 GoodMemory 的 typed / governed / evaluable 骨架，吸收 MemPalace 的 evidence-first、layered recall、protocol-first、benchmark-driven 思路，做成一个 library-first、可自进化的 memory compiler。

这里把你说的“以后像 hermes-agent 一样，能够自我进化，越用越强”操作化为 4 个具体能力：

1. 系统能持续采集使用信号，而不是只存 memory。
2. 系统能在后台做 consolidation / repair / pruning，而不是只在 recall 时被动取数。
3. 系统能根据 miss case 改进提取和检索策略，而不是停留在规则堆叠。
4. 系统能沉淀 agent 自己的做事经验，而不只是沉淀用户事实。

## 2. 对 MemPalace 的判断

### 2.1 它为什么有效

从 `third-party/mempalace-main` 看，MemPalace 的核心不是“抽取更聪明的 memory”，而是“尽量不丢信息，再把信息组织得足够可找”。

它的主链路大致是：

1. `onboarding.py`
   - 建立世界坐标系：人物、项目、wing 分类、entity registry。
2. `miner.py` / `convo_miner.py` / `general_extractor.py`
   - 多来源 ingest。
   - 文本 chunk。
   - 路由到 `wing / room / hall`。
   - 将 verbatim chunk 作为 drawer 写入 ChromaDB。
3. `searcher.py` / `layers.py`
   - 通过分层装载和语义检索取回证据。
4. `mcp_server.py`
   - 通过 `PALACE_PROTOCOL` 把 memory 使用行为制度化。
5. `knowledge_graph.py` / `entity_registry.py` / `palace_graph.py`
   - 用 temporal KG、entity registry、跨 wing tunnel 补足“时间变化”和“主题连接”。
6. `benchmarks/*`
   - 通过 LongMemEval、LoCoMo 等 miss case 反向优化 retrieval strategy。

### 2.2 最值得借鉴的地方

- `evidence-first`
  - 不在写入阶段把 why / tradeoff / failure context 过早压扁。
- `structure as retrieval primitive`
  - taxonomy 不只是展示层，组织结构本身能提高召回。
- `layered loading`
  - 常驻少量高价值上下文，按需加深，不把所有历史都塞进 prompt。
- `protocol-first`
  - 不是只有 API，还规定 agent 何时查、何时写、何时校正。
- `benchmark-driven iteration`
  - 不是凭感觉调策略，而是围绕失败样本做定向修复。

### 2.3 不应该照搬的地方

- 不应默认“全部原文都存”
  - GoodMemory 的定位仍然是 selective memory layer，而不是全量对话仓库。
- 不应把启发式 taxonomy 当成最终答案
  - MemPalace 的不少 room/topic 路由强依赖关键词和文件路径，泛化有限。
- 不应把压缩方言当成唯一真相载体
  - GoodMemory 更适合做“可追溯的压缩投影”，而不是把压缩格式本身变成事实来源。
- 不应把 benchmark overfitting 当能力增长
  - 必须让策略改进经过产品 eval 与治理层双重门控。

## 3. GoodMemory 当前现状判断

### 3.1 已经具备的基础

GoodMemory 现在已经有一个很好的“自进化 memory layer”骨架，只是关键闭环还没有接上。

已经存在的基础：

- typed memory model
  - `profile / preference / reference / fact / feedback / episode`
- runtime plane
  - `SessionBuffer`、`WorkingMemorySnapshot`、`SessionJournal`
- maintenance scaffold
  - dedupe、contradiction、consolidation
- dream gate
  - session gate、time gate、锁语义
- policy hooks
  - `shouldRemember`、`shouldRecall`、`redact`、`resolveConflict`
- verification hints
  - stale / inferred memory 的行动前验证提醒
- eval harness
  - baseline vs GoodMemory A/B、LLM-as-judge、trace artifact

这些能力分散在以下位置：

- `src/remember/engine.ts`
- `src/recall/engine.ts`
- `src/runtime/contextService.ts`
- `src/runtime/spillover.ts`
- `src/maintenance/runner.ts`
- `src/maintenance/dream.ts`
- `src/policy/hooks.ts`
- `src/eval/*`

### 3.2 当前真正的短板

1. `remember()` 仍然过轻
   - 当前 extractor 主要是 regex / heuristic。
   - 这适合 v1 闭环，不足以支撑持续学习与长期演化。

2. `recall()` 仍然偏 rules-first + lexical-first
   - `facts`、`references`、`episodes` 的选择仍主要靠词面重叠与简单排序。
   - `vectorStore` 和 `embedding` 接口已经预留，但还未真正进 recall 主链路。

3. `maintenance` 与 `eval` 没接起来
   - 现在能跑 maintenance，也能跑 eval。
   - 但系统不会自动把“失败的 recall 样本”转化为下一轮 maintenance / strategy 改进输入。

4. `dream` 只有 gate，没有 worker
   - 已有“何时可以 dream”的判断。
   - 但没有真正的 `Orient -> Gather -> Consolidate -> Prune -> Publish` 流程。

5. 缺少 evidence plane
   - 现在 durable memory 主要是结构化结果。
   - 缺少“与 typed memory 绑定的原文证据层”，这会限制 why / tradeoff / failure context 的回放能力。

6. 缺少 agent 自身经验沉淀
   - 现在 GoodMemory 主要记“用户”和“会话”。
   - 还不太记“这个 agent 对这个用户、这个项目、这类任务，什么做法更有效”。

## 4. 增强方向总原则

### 4.1 要借鉴的不是“全部照存”，而是“双层记忆”

GoodMemory 未来应该明确区分两类 durable signal：

- typed durable memory
  - profile / preference / reference / fact / feedback / episode
- evidence memory
  - 从会话、工具结果、文档片段中切出来的 verbatim evidence shard

前者服务治理、更新、导出、控制。
后者服务 why、trace、rerank、deep recall、dream consolidation。

### 4.2 要坚持 library-first，而不是平台先行

GoodMemory 仍然应该保持现在的心智模型：

- 默认接入简单
- 默认不开启复杂后台基础设施也能工作
- 复杂能力通过 optional adapter / worker / provider layer 打开

### 4.3 “自我进化”必须是可治理的

所有自进化能力都必须满足：

- 有 trace
- 有评测
- 有 policy gate
- 有 rollback
- 有 provenance

否则它不是进化，而是漂移。

## 5. 目标架构：从 Memory Layer 到 Memory Compiler

### 5.1 新的五层内部平面

在现有 `runtime / durable / maintenance / eval` 基础上，把内部架构明确为 5 个平面：

1. Runtime Plane
   - 当前会话态：buffer、working memory、journal、spillover。

2. Typed Durable Plane
   - 当前已有的 typed memory 继续保留，作为主治理面。

3. Evidence Plane
   - 新增。
   - 存放 evidence shard、tool-result shard、conversation excerpt、doc excerpt。
   - typed memory 只做高价值抽象，evidence 负责保留上下文证据。

4. Reflection / Dream Plane
   - 新增真正的后台 compiler。
   - 负责 session reflection、cross-session consolidation、pruning、strategy hint generation。

5. Evolution Control Plane
   - 新增策略控制层。
   - 负责把 recall trace、feedback、verification、eval miss 聚合成“可学习信号”，并决定哪些改动可以升级为默认策略。

### 5.2 新的 recall 分层模型

借鉴 MemPalace 的 L0-L3，但按 GoodMemory 的定位重构为：

- L0: Identity / Policy Layer
  - 用户身份、强约束、关键 procedural memory。
- L1: Durable Working Set
  - 高价值 typed memory：profile、active preferences、current references、stable facts。
- L2: Scoped Continuity Layer
  - 当前 workspace / agent / session 相关的 episode、open loops、journal、working memory。
- L3: Evidence Search Layer
  - evidence shard 的 hybrid retrieval。
  - 用于取回 why、tradeoff、失败历史、原文语境。
- L4: Verification / Authority Layer
  - 行动前验证。
  - 当 recall 驱动动作时，优先读取 authority source 或进行 lightweight re-check。

这意味着未来 `recall()` 不再只是“列出几类 memory”，而是：

1. 先决定应该打开哪些 layer。
2. 再为每个 layer 生成候选。
3. 再做 explainable fusion / rerank。
4. 最后按 token budget 组装上下文。

## 6. 建议新增的关键能力

### 6.1 Evidence Plane

新增 `EvidenceRecord`，至少包含：

- `id`
- `scope`
- `sessionId`
- `sourceType`
  - `conversation_turn`
  - `tool_result`
  - `document_excerpt`
  - `retrieval_result`
- `sourceId`
- `content`
- `preview`
- `topics`
- `entities`
- `createdAt`
- `embeddingId?`
- `linkedMemoryIds[]`

价值：

- recall 可以回放 why
- typed memory 可以有 evidence backing
- dream 可以用 evidence 做跨会话 consolidation
- eval 可以检查“命中了 memory 但没命中证据”这类失败模式

### 6.2 Explainable Hybrid Retrieval

把现在的 recall 升级为可解释的 hybrid retrieval：

- lexical overlap
- semantic candidate retrieval
- temporal boost
- source confidence boost
- explicit > inferred
- validated feedback alignment
- optional rerank

这里不需要一开始就追求最复杂，而要先把 plumbing 打通：

1. embeddings 真正写入
2. typed memory 与 evidence 都能向量检索
3. fusion score 有 trace
4. eval 能区分哪个 boost 真正有用

### 6.3 Post-Session Reflection Worker

在会话结束或达到阈值后，运行 reflection worker，产出 5 类结果：

1. `session_digest`
2. `candidate_memory_updates`
3. `procedural_learnings`
4. `stale_memory_candidates`
5. `retrieval_lessons`

重点不是“把 session 再总结一遍”，而是把 session 编译成可维护的 memory delta。

### 6.4 Dream Worker

将 `src/maintenance/dream.ts` 从 gate 扩展为真正的 dream workflow：

1. Orient
   - 读最近若干 session、open loops、verification failures、eval failures。
2. Gather
   - 拉取相关 typed memory 与 evidence shard。
3. Consolidate
   - 合并重复 episode。
   - 提升稳定 fact。
   - 形成 procedural pattern。
4. Prune
   - 标记 stale / superseded / low-value memory。
5. Publish
   - 更新 compact memory view。
   - 更新 topic graph。
   - 更新 retrieval strategy hints。

Dream 的输出不是直接改一切，而是生成可评测、可审计的变更候选。

### 6.5 Agent Diary / Specialist Memory

这一步决定 GoodMemory 能不能从“记用户”走到“记协作方式”和“记 agent 自身经验”。

建议新增两类记忆：

- `AgentProcedureMemory`
  - 某 agent 在某类任务中哪些做法更有效
- `TaskPatternMemory`
  - 在某 workspace / topic 下，什么问题经常复发、什么解法更稳

例子：

- reviewer agent 在这个仓库里更应该先看 integration tests 再看实现
- coding agent 在这个项目里优先信任 `docs/` 与 `task-board/`
- 这个用户在设计任务上更重视分层和可治理，而不是纯检索率

### 6.6 Compressed Memory View

借鉴 AAAK 的方向，但不复制语法。

建议做 `GoodMemory Compact View`：

- 面向 LLM 阅读，不面向人类编辑
- 永远能回链到 typed memory 和 evidence
- 是 projection，不是 source of truth
- 可以按 `L0 / L1 / L2` 分层生成

这能显著提升长会话和 agent 唤醒时的上下文利用效率。

## 7. 需要打通的四个闭环

### 7.1 信号闭环

输入信号来源：

- `feedback()`
- recall hit trace
- verification outcome
- forget/export/delete action
- session reflection
- product eval result

输出：

- retrieval miss taxonomy
- strategy candidate
- stale memory candidate
- memory quality score

### 7.2 维护闭环

从当前的 `dedupe / contradiction / consolidation`，升级到：

- dedupe
- contradiction repair
- stale verification queue
- open-loop aging
- evidence-to-memory promotion
- low-value memory pruning

### 7.3 检索学习闭环

每次 recall 都记录：

- 哪些 layer 被打开
- 命中了什么
- 没命中什么
- 哪类 memory 后续被用户纠正
- 哪类 recall 最终没有帮助回答

最终目标不是“检索更多”，而是“更少但更准，并能解释为什么”。

### 7.4 评测闭环

当前 eval 已经很好，下一步要升级为策略迭代引擎：

- 自动把失败样本归因到：
  - extract
  - merge
  - retrieve
  - render
  - verify
  - maintain
- 自动生成新的 eval slice
- 只有通过 eval gate 的策略才能 promoted 为默认策略

## 8. 分阶段实施计划

### Phase 1: 把基础闭环接上

目标：

- 不改变 GoodMemory 对外最小 API
- 先把 evidence、signal、trace 接起来

实施项：

- 新增 `src/evidence/*`
- `remember()` 同时写 typed memory 与 evidence shard
- `recall()` metadata 新增 layer trace、fusion trace、evidence hit
- `eval` 新增 miss taxonomy
- `feedback / verification / recall` 统一进入 learning signal

完成标志：

- 每条 durable memory 能追到 evidence
- 每次 recall 能解释命中路径
- eval 能输出失败归因，而不是只有输赢

### Phase 2: 混合检索与分层装载

目标：

- 让 recall 真正从 rules-first 走向 explainable hybrid retrieval

实施项：

- 落地 embedding adapter
- 落地 vector write hooks
- typed memory + evidence 双索引
- recall planner 打开 `L0-L4`
- context builder 支持 compact layer rendering

完成标志：

- targeted eval slice 中 recall 命中率和 answer quality 有可验证提升
- token 使用受控，没有靠“注入更多内容”换分数

### Phase 3: Reflection 与 Dream

目标：

- 让系统真的开始跨 session 学习

实施项：

- 新增 reflection worker
- 将 dream 从 gate 扩展为 compiler workflow
- dream 产出 procedural pattern / stale candidate / promoted fact
- maintenance runner 与 dream workflow 联动

完成标志：

- 长生命周期场景中，系统能自动修复一部分 stale / duplicate / contradictory memory
- procedural memory 会随着使用变强，而不是只会越积越多

### Phase 4: Agent 自身经验与自进化策略

目标：

- 让 GoodMemory 从“记用户”进化到“记用户 + 记协作方式 + 记自己如何更有效”

实施项：

- 新增 specialist memory
- agent diary / role-specific reflection
- strategy registry
- eval-driven promotion / rollback

完成标志：

- 同一 agent 在同类任务里表现随使用周期稳定提升
- 策略更新可被回放、解释、评测和回滚

## 9. 与当前代码结构的对应改造建议

建议按以下方式改造，而不是大爆炸重写：

- `src/remember/deterministicExtractor.ts`
  - 升级为 extractor chain 的默认实现之一。
- `src/remember/engine.ts`
  - 增加 evidence write、memory-evidence link、reflection enqueue。
- `src/recall/engine.ts`
  - 引入 layer planner、hybrid retrieval、fusion trace。
- `src/recall/contextBuilder.ts`
  - 支持分层渲染和 compact memory view。
- `src/maintenance/runner.ts`
  - 增加 verify / prune / promote 类 job。
- `src/maintenance/dream.ts`
  - 从 gate 变为 gate + workflow coordinator。
- `src/runtime/contextService.ts`
  - 成为 reflection / diary 的主要输入面。
- `src/eval/*`
  - 增加 miss taxonomy、strategy compare、promotion gate。
- 新增目录建议：
  - `src/evidence/`
  - `src/reflection/`
  - `src/evolution/`

## 10. 成功指标

建议把“越用越强”定义成以下可测指标，而不是抽象口号：

- evidence-backed recall rate
- stale-memory-caused error rate
- user correction recurrence rate
- procedural memory hit usefulness
- long-lifecycle scenario win rate
- targeted eval uplift
- dream yield
  - 每次 dream 产生的高价值修正数
- promoted-strategy survival rate
  - 被升级为默认策略后，后续是否仍保持增益

## 11. 风险与边界

### 风险

- 过早把系统做成平台，丢掉接入简洁性
- evidence plane 失控膨胀，反而变成第二套全量历史
- dream 过度自治，绕过治理与评测
- 过拟合评测集，损害真实产品表现

### 边界

- GoodMemory 仍然不是 chat history database
- GoodMemory 仍然不是 full memory OS
- GoodMemory 仍然坚持 selective memory + governed evolution

## 12. 最终判断

MemPalace 值得 GoodMemory 借鉴的，不是“全部存下来”这个表层做法，而是它背后的 5 个正确判断：

- 保留证据
- 强结构组织
- 分层装载
- 协议驱动
- 评测反哺

GoodMemory 已经有比 MemPalace 更适合走向产品级 memory layer 的底盘：

- typed memory
- scope isolation
- policy hooks
- verification
- eval harness

接下来最重要的，不是继续新增更多 memory type，而是把这几件事接成闭环：

> evidence plane + hybrid retrieval + reflection/dream + eval-driven promotion

当这四件事接上，GoodMemory 才会真正从“有记忆层”变成“会进化的记忆层”。
