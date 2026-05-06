# GoodMemory 架构文档与开发计划

## 1. 项目定位

**GoodMemory** 是一个面向 Chatbox / Agent / Copilot / Workflow Agent 的开源“用户记忆层”模块。

目标不是替代大模型，也不是替代 RAG，而是作为一个独立、可嵌入、可自托管、可扩展的 **Personal Context Engine（个人上下文引擎）**，让任何接入外部 LLM 的产品在安装后具备更稳定的“记住用户”的能力。

### 1.1 核心价值

安装 `goodmemory` 后，任意上层产品应获得以下能力：

- 记住用户是谁：身份、职业、语言、长期背景
- 记住用户喜欢怎样被服务：回答风格、格式偏好、交互偏好
- 记住与当前问题相关的历史事件：曾经聊过什么、做过什么、决定过什么
- 记住当前会话的工作状态：当前目标、约束、开放问题、临时结论
- 在不改动底层 LLM 的前提下，自动构建更好的 prompt context

### 1.2 非目标

GoodMemory 不负责：

- 模型训练 / 微调
- 通用知识 RAG 的全部场景
- Agent orchestration 本身
- UI 聊天产品本身
- 替用户自动做敏感画像

它专注于：**用户长期记忆与个性化上下文编排**。

---

## 2. 设计原则

### 2.1 分层记忆，而不是一个大向量库

GoodMemory 的首要原则：

> 不把所有“记忆”都当成 embedding 检索问题。

记忆至少分成四层：

1. **Profile Memory**：用户身份与稳定事实
2. **Preference Memory**：用户偏好与服务方式
3. **Episodic Memory**：历史事件与对话摘要
4. **Working Memory**：当前会话工作记忆

### 2.2 结构化优先，语义检索补充

- 能精确表达的事实，优先结构化存储
- 需要模糊回忆的历史，才使用 embedding / rerank
- 召回后必须压缩，不能原样全部注入上下文

### 2.3 更新优先于追加

一个记忆系统的上限，不是“存多少”，而是“能否正确更新”。

GoodMemory 必须支持：

- 重复合并
- 冲突更新
- 生命周期衰减
- 删除与撤回
- 用户确认写入

### 2.4 引擎独立于框架

GoodMemory 不绑定 LangGraph、Autogen、CrewAI、Mastra、OpenAI Agents SDK 或任何单一框架。

它应以 **SDK + API + Storage Adapter + Retrieval Pipeline** 形式存在。

### 2.5 可解释、可控、可审计

上层产品最终必须能回答：

- 为什么这次会记住这个？
- 为什么这次回答引用了这个记忆？
- 如何删除它？
- 它是用户说过的，还是系统推断出来的？

---

## 3. 核心能力边界

### 3.1 写入能力

- 从消息流中抽取候选记忆
- 识别事实 / 偏好 / 事件 / 洞察
- 记忆打分与筛选
- 合并、更新、版本化
- 生成摘要与 embedding

### 3.2 检索能力

- 基于用户问题与当前会话状态进行多路召回
- 支持结构化查找、关键词检索、向量检索、时间加权
- 支持 rerank 与去重
- 支持生成“本轮记忆注入包”

### 3.3 上下文构建能力

- 生成 profile 摘要
- 生成 preference 摘要
- 选择相关历史事件
- 结合 working memory 压缩成本轮上下文

### 3.4 管理能力

- 浏览记忆
- 置顶 / 删除 / 失效 / 更新
- 可视化冲突
- 导入 / 导出
- 多租户与项目空间隔离

---

## 4. 总体架构

```text
┌────────────────────────────────────────────────────────────┐
│                    上层 Chatbox / Agent                    │
│   OpenAI SDK / Claude SDK / LangGraph / 自研 Agent       │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                    GoodMemory SDK Layer                    │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Write API    │  │ Recall API   │  │ Context API      │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Memory Compiler / Policy Engine                      │  │
│  │ - extract                                            │  │
│  │ - classify                                           │  │
│  │ - dedupe                                             │  │
│  │ - resolve conflict                                   │  │
│  │ - summarize                                          │  │
│  │ - score                                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Retrieval Fusion Engine                              │  │
│  │ - exact lookup                                       │  │
│  │ - metadata filter                                    │  │
│  │ - BM25 / keyword                                     │  │
│  │ - vector search                                      │  │
│  │ - rerank                                             │  │
│  │ - packet builder                                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                     GoodMemory Storage                     │
│  PostgreSQL / pgvector / Redis / S3-compatible blobs       │
└────────────────────────────────────────────────────────────┘
```

---

## 5. 逻辑分层设计

## 5.1 SDK Layer

对外暴露统一 npm 接口：

- `remember()`
- `recall()`
- `buildContext()`
- `updateProfile()`
- `forget()`
- `listMemories()`
- `feedback()`

目标：让上层产品最小改造即可接入。

### 设计要求

- TypeScript 优先
- ESM + CJS 双构建
- Node first，兼容 Edge / Bun / Deno 的 runtime adapter
- 框架无关
- 支持 middleware 风格接入

---

## 5.2 Memory Compiler

这是 GoodMemory 的核心，不是简单 CRUD 层。

### 职责

1. 从会话 turn 中抽取候选记忆
2. 分类：fact / preference / episode / insight
3. 判断是否值得长期保存
4. 与现有记忆进行合并、冲突处理或版本更新
5. 生成摘要、标签、embedding、重要性评分

### 处理流程

```text
new messages
   ↓
candidate extraction
   ↓
memory classification
   ↓
memory scoring
   ↓
merge / update / version
   ↓
summarize
   ↓
persist + index
```

### Compiler 子模块

- `CandidateExtractor`
- `MemoryClassifier`
- `MemoryScorer`
- `ConflictResolver`
- `MemoryMerger`
- `Summarizer`
- `Indexer`

---

## 5.3 Retrieval Fusion Engine

### 目标

不要让上层产品自己拼 profile + vector recall + keyword recall。

GoodMemory 负责输出已经压缩好的上下文包。

### 多路召回来源

1. **Exact Lookup**
   - profile
   - preference
   - pinned memories

2. **Metadata Filter Recall**
   - by topic
   - by project
   - by session
   - by recency window

3. **Keyword / BM25 Recall**
   - 精确术语
   - 文件名
   - 领域词汇

4. **Vector Recall**
   - episodic memory
   - summary memory
   - insight memory

5. **Recent Session Recall**
   - 最近若干轮摘要
   - 最近一个 session snapshot

### 融合打分

建议公式：

```text
final_score =
  semantic_score * w1 +
  keyword_score  * w2 +
  recency_score  * w3 +
  importance      * w4 +
  confidence      * w5 +
  memory_type     * w6 +
  user_pinned     * w7
```

### 结果处理

- 去重
- 同主题归并
- 与当前 working memory 合并
- 输出 token budget 控制下的 memory packet

---

## 5.4 Context Builder

### 输入

- 当前用户消息
- 当前 session state
- recall results
- token budget
- target model metadata

### 输出

结构化上下文对象：

```ts
interface MemoryPacket {
  profileSummary: string;
  preferenceSummary: string;
  relevantEpisodes: Array<{
    id: string;
    summary: string;
    score: number;
  }>;
  workingMemorySummary?: string;
  toolHints?: string[];
  debug?: Record<string, unknown>;
}
```

### 输出模式

- `json`
- `markdown`
- `system_prompt_fragment`
- `developer_prompt_fragment`

上层产品可自由决定拼接策略。

---

## 5.5 Policy Engine

这是让 GoodMemory 从“组件”变成“产品”的关键。

### 策略项

- 哪些信息可以自动记住
- 哪些信息必须用户确认后保存
- 哪些敏感信息默认不保存
- 哪些项目空间彼此隔离
- 哪些记忆允许跨-agent 共享
- 何时触发衰减 / 归档 / 删除

### Policy 类型

- `privacy_policy`
- `memory_write_policy`
- `memory_retention_policy`
- `multi_agent_sharing_policy`
- `tenant_isolation_policy`

---

## 5.6 Admin / Debug Layer

建议为开源项目提供一个最小 Web UI 或开发者控制台。

### 能力

- 查看 user profile
- 查看 preference 及来源
- 查看 episodic memories
- 查看某条记忆的生成链路
- 查看 recall 命中明细
- 查看 buildContext 结果
- 手工编辑 / 删除 / 置顶

这个模块对调试记忆质量极其重要。

---

## 6. 数据模型设计

## 6.1 核心实体

### User

```ts
interface GMUser {
  id: string;
  tenantId: string;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Profile Memory

```ts
interface ProfileMemory {
  id: string;
  userId: string;
  key: string;
  value: unknown;
  confidence: number;
  source: "user" | "system" | "import";
  updatedAt: string;
  version: number;
  isActive: boolean;
}
```

### Preference Memory

```ts
interface PreferenceMemory {
  id: string;
  userId: string;
  category: string;
  value: unknown;
  confidence: number;
  source: "user" | "system_inferred";
  evidenceCount: number;
  updatedAt: string;
  isPinned?: boolean;
}
```

### Episodic Memory

```ts
interface EpisodicMemory {
  id: string;
  userId: string;
  tenantId: string;
  projectId?: string;
  sessionId?: string;
  topic?: string;
  summary: string;
  rawRefs?: string[];
  entities?: string[];
  tags?: string[];
  importance: number;
  confidence: number;
  createdAt: string;
  archivedAt?: string;
  embeddingId?: string;
}
```

### Insight Memory

```ts
interface InsightMemory {
  id: string;
  userId: string;
  kind: "pattern" | "habit" | "goal" | "risk";
  content: string;
  confidence: number;
  evidenceMemoryIds: string[];
  updatedAt: string;
}
```

### Working Memory Snapshot

```ts
interface WorkingMemorySnapshot {
  sessionId: string;
  userId: string;
  state: Record<string, unknown>;
  currentGoal?: string;
  openLoops?: string[];
  updatedAt: string;
}
```

---

## 6.2 存储表建议

### PostgreSQL

- `gm_users`
- `gm_profile_memories`
- `gm_preference_memories`
- `gm_episodic_memories`
- `gm_insight_memories`
- `gm_sessions`
- `gm_working_memory_snapshots`
- `gm_memory_events`
- `gm_memory_feedback`
- `gm_memory_audit_logs`
- `gm_policies`

### pgvector

- `gm_memory_embeddings`

### Redis

- 热 session state
- recent recall cache
- buildContext cache
- idempotency keys

### Blob Storage（可选）

- 原始对话转储
- 压缩后的 session archive
- 调试日志

---

## 7. 模块划分（Monorepo）

推荐 pnpm monorepo。

```text
goodmemory/
  apps/
    docs/
    playground/
    admin-ui/
  packages/
    core/
    sdk/
    storage-postgres/
    storage-redis/
    vector-pgvector/
    vector-qdrant/
    compiler/
    retrieval/
    context-builder/
    policies/
    embeddings/
    llm-adapters/
    observability/
    shared/
    cli/
  examples/
    nextjs-chat/
    langgraph-agent/
    openai-agents/
    express-chat-api/
  scripts/
  docs/
```

### 包职责

#### `@goodmemory/core`
- 类型定义
- 接口抽象
- orchestration service

#### `@goodmemory/sdk`
- npm 对外主入口
- 高级 API

#### `@goodmemory/compiler`
- 记忆抽取与编译逻辑

#### `@goodmemory/retrieval`
- recall pipeline
- rerank pipeline

#### `@goodmemory/context-builder`
- token budget
- memory packet 生成

#### `@goodmemory/storage-postgres`
- profile / preference / episode 等持久化

#### `@goodmemory/vector-pgvector`
- 向量写入与召回

#### `@goodmemory/embeddings`
- embedding provider adapters

#### `@goodmemory/llm-adapters`
- OpenAI / Anthropic / Gemini / OpenRouter provider 抽象

#### `@goodmemory/policies`
- 默认策略与策略执行器

#### `@goodmemory/observability`
- tracing
- metrics
- recall diagnostics

#### `@goodmemory/cli`
- 初始化项目
- 迁移数据库
- 本地调试

---

## 8. 对外 API 设计

## 8.1 高级 API

```ts
const gm = createGoodMemory({ ...config });

await gm.remember({
  userId,
  tenantId,
  messages,
  sessionId,
  mode: "auto"
});

const packet = await gm.buildContext({
  userId,
  tenantId,
  sessionId,
  query: userMessage,
  tokenBudget: 1200,
  output: "markdown"
});

const recall = await gm.recall({
  userId,
  query: "上次讨论的机器人异常恢复",
  topK: 8
});

await gm.forget({
  userId,
  memoryId
});
```

---

## 8.2 中级 API

```ts
await gm.profile.upsertFact(...)
await gm.preferences.upsert(...)
await gm.episodes.create(...)
await gm.episodes.search(...)
await gm.context.build(...)
await gm.feedback.submit(...)
```

---

## 8.3 事件驱动 API

```ts
gm.on("memory.created", handler)
gm.on("memory.updated", handler)
gm.on("memory.conflict", handler)
gm.on("context.built", handler)
```

适合与 agent runtime / analytics 平台集成。

---

## 9. 写入链路设计

### 9.1 触发方式

- 每个回合后写入
- 每个 session 结束后批量写入
- 显式调用写入
- 低优先级异步写入

推荐默认策略：

- working memory 同步更新
- long-term memory 异步编译写入

### 9.2 写入步骤

1. 预处理消息
2. 抽取候选事实/偏好/事件
3. 评分
4. 检查隐私策略
5. 查询已有记忆
6. 决定 append / merge / update / reject
7. 持久化
8. 生成 embedding
9. 发出事件

### 9.3 记忆评分建议

```text
memory_score =
  future_relevance +
  stability +
  user_specificity +
  actionability +
  novelty -
  sensitivity_penalty -
  noise_penalty
```

### 9.4 冲突处理策略

#### Profile / Fact
- 同 key 覆盖更新
- 保留 version history

#### Preference
- 合并证据计数
- 信心增减

#### Episode
- 避免重复事件多次写入
- 同主题近时间窗口做聚合

#### Insight
- 仅在多条证据支持下生成

---

## 10. 检索链路设计

### 10.1 输入

- userId
- tenantId
- query
- currentSessionState
- projectId
- modelContextLimit
- retrievalProfile

### 10.2 流程

```text
query
 ↓
intent analysis
 ↓
retrieval plan generation
 ↓
multi-source recall
 ↓
rerank
 ↓
dedupe / cluster
 ↓
compress
 ↓
context packet
```

### 10.3 意图类型

- `personalization_only`
- `task_continuation`
- `history_lookup`
- `advice`
- `project_collaboration`
- `agent_execution`

### 10.4 检索策略模板

#### personalization_only
- 强调 profile + preference
- 少量 recent episodes

#### task_continuation
- 强调 session snapshot + recent episodes + project-specific facts

#### history_lookup
- 强调 episodic vector recall + keyword recall + timeline sort

#### agent_execution
- 强调 working memory + tool-related episodes + constraints

---

## 11. Prompt / Context 契约

GoodMemory 不强制用户采用某种 prompt 格式，但建议输出统一 memory packet。

### 推荐 markdown 片段

```md
## User Profile
- ...

## User Preferences
- ...

## Relevant History
- ...

## Current Working Memory
- ...
```

### 推荐 JSON 片段

```json
{
  "profile": "...",
  "preferences": "...",
  "history": ["...", "..."],
  "working_memory": "..."
}
```

### 推荐 system fragment

面向 system / developer prompt 输出紧凑摘要，避免把冗长历史直接塞进去。

---

## 12. 插件与适配器体系

## 12.1 Storage Adapter

接口：

- `ProfileStore`
- `PreferenceStore`
- `EpisodeStore`
- `InsightStore`
- `WorkingMemoryStore`

默认实现：

- Postgres
- Redis

扩展实现：

- MongoDB
- DynamoDB
- SQLite（本地开发）

## 12.2 Vector Adapter

默认：

- pgvector

扩展：

- Qdrant
- Weaviate
- Pinecone
- Milvus

## 12.3 Embedding Provider Adapter

- OpenAI
- Voyage AI
- Jina
- Gemini
- local embedding model

## 12.4 Rerank Adapter

- Cohere rerank
- Jina reranker
- local cross-encoder

## 12.5 LLM Adapter

仅用于 compiler / summarizer / extractor，不绑定最终主回答模型。

---

## 13. 隐私与安全设计

## 13.1 默认安全原则

- 最小必要记忆
- 默认不开启敏感推断
- 提供 PII redaction pipeline
- 支持 tenant 隔离
- 支持 user-scoped encryption

## 13.2 数据分级

- P0：用户明确要求记住的偏好/事实
- P1：普通产品级个性化信息
- P2：可选历史摘要
- P3：敏感信息（默认不记或需确认）

## 13.3 删除与导出

必须支持：

- 删除单条记忆
- 删除某个类别的记忆
- 删除某个项目空间全部记忆
- 导出用户所有记忆
- 彻底清除 embeddings 与缓存

## 13.4 审计

每一次写入、更新、删除，都应该有 audit log。

---

## 14. 多租户与多 Agent 设计

## 14.1 多租户

GoodMemory 必须默认支持：

- `tenantId`
- `workspaceId`
- `userId`
- `projectId`
- `agentId`

### 隔离级别

- tenant 级隔离
- workspace 级共享
- user 级私有
- agent 级私有 working memory

## 14.2 多 Agent 共享

某些上层产品会有多个 agent：

- chat agent
- coding agent
- planner agent
- research agent

GoodMemory 应支持三种共享模式：

1. `private`
2. `workspace_shared`
3. `global_readonly`

---

## 15. 可观测性与评估

## 15.1 核心指标

### 写入质量
- extraction precision
- merge success rate
- conflict resolution rate
- duplicate suppression rate

### 检索质量
- recall hit rate
- irrelevant memory rate
- memory packet token size
- rerank effectiveness

### 产品效果
- user repetition reduction
- personalization satisfaction
- context cost reduction
- memory-assisted answer win rate

## 15.2 调试能力

- 为什么召回了这条记忆
- 为什么没有召回那条记忆
- 本轮 token budget 怎么分配的
- 哪些记忆被压缩掉了
- 哪些策略阻止了写入

---

## 16. 开源项目技术选型建议

### 语言
- TypeScript 为主
- SQL migrations
- 少量 Rust 可留作后续性能插件，不作为 MVP 必需

### 后端
- Node.js 20+
- Fastify / Hono 作为调试或管理 API

### 存储
- PostgreSQL
- pgvector
- Redis

### 打包
- pnpm monorepo
- tsup / unbuild
- changesets

### 质量保障
- Vitest
- Playwright（admin UI）
- ESLint + Biome 或 Prettier
- GitHub Actions

---

## 17. MVP 范围定义

### MVP 必须有

1. 用户 profile / preference 存储
2. episodic summary 存储
3. pgvector 检索
4. remember / recall / buildContext API
5. 基础 memory compiler
6. Postgres adapter
7. OpenAI-compatible embedding adapter
8. 简单的 admin/debug UI
9. 文档和 examples

### MVP 不做

- 图数据库 memory
- 多模态 memory
- 复杂自学习策略
- 联邦记忆
- 分布式召回集群

---

## 18. 版本路线图

## v0.1（Developer Preview）

### 目标
证明 GoodMemory 的核心 API 和数据模型成立。

### 功能
- 基础 types
- Postgres schema
- remember / recall / buildContext
- profile + preference + episode
- pgvector recall
- 最简单 compiler
- 2 个 example apps

### 交付物
- npm package
- docker-compose for local dev
- docs site

---

## v0.2（Usable OSS）

### 目标
让独立开发者和小团队能真正接进产品。

### 功能
- policy engine 初版
- conflict resolver
- audit logs
- memory feedback API
- admin/debug UI
- retrieval diagnostics
- Redis session cache
- 适配 Anthropic / Gemini embedding workflow

---

## v0.3（Production Candidate）

### 目标
面向 SaaS / 多租户产品。

### 功能
- 多租户隔离
- project / workspace scopes
- memory export/delete APIs
- retention policies
- async jobs
- batch compiler
- more adapters

---

## v0.4（Ecosystem）

### 目标
成为 agent framework 通用记忆层。

### 功能
- LangGraph adapter
- OpenAI Agents adapter
- Mastra adapter
- custom middleware SDK
- plugin marketplace style extension points

---

## 19. 详细开发计划

## Phase 0：设计与验证（2 周）

### 任务
- 明确数据模型
- 明确 API contract
- 画出写入/检索/注入数据流
- 选择存储抽象
- 选定 monorepo 结构
- 定义示例产品接入方式

### 输出
- Architecture Decision Records（ADR）
- ER 图
- package boundaries
- MVP scope doc

---

## Phase 1：核心基础设施（2~3 周）

### 任务
- 初始化 monorepo
- shared types / errors / logging
- createGoodMemory 核心工厂
- Postgres migrations
- storage interfaces
- storage-postgres 实现
- pgvector adapter

### 输出
- 本地 dev stack 可跑通
- integration tests

---

## Phase 2：Memory Compiler MVP（2~3 周）

### 任务
- candidate extractor
- simple classifier
- memory scorer
- dedupe
- basic summarizer
- write pipeline

### 输出
- `remember()` 能将对话写入 profile/preference/episode
- 基础置信度与重复抑制生效

---

## Phase 3：Recall & Context Builder（2 周）

### 任务
- exact lookup
- vector recall
- keyword recall
- fusion rerank
- packet builder
- token budget control

### 输出
- `recall()`
- `buildContext()`
- 基本检索质量测试

---

## Phase 4：SDK 与 Examples（2 周）

### 任务
- npm SDK 打磨
- 文档站
- Next.js chat demo
- Express API demo
- LangGraph demo

### 输出
- 开发者能 15 分钟接入

---

## Phase 5：Admin UI & Observability（2 周）

### 任务
- memory explorer
- recall diagnostics
- audit log viewer
- packet preview
- manual edit / delete

### 输出
- 调试体验完善

---

## Phase 6：策略、隐私、多租户（3 周）

### 任务
- retention policies
- privacy policy hooks
- confirm-before-save flow
- tenant/workspace scoping
- export/delete pipeline

### 输出
- 可用于更正式的 SaaS 产品

---

## 20. 团队分工建议

如果按最小有效团队配置：

### 1 名架构 / 后端主程
- 核心设计
- compiler
- retrieval
- storage

### 1 名全栈
- admin UI
- docs site
- examples

### 1 名平台 / DevOps（可兼职）
- CI/CD
- docker
- observability
- 发布流程

### 1 名产品 / DX 负责人（可兼职）
- API 设计
- 文档体验
- example 质量

---

## 21. 风险与难点

### 21.1 最大风险

不是技术栈，而是 **记忆质量**。

### 21.2 典型难点

- 提取不准：把无关内容记进去
- 更新不准：旧记忆和新记忆打架
- 召回不准：相关记忆召不回，不相关的召回来
- 注入过多：memory packet 太长
- 用户不信任：不知道系统记住了什么

### 21.3 应对策略

- 先做 profile / preference / episode 三类
- 默认 conservative write policy
- 以 debug visibility 为第一优先级
- 用 examples 驱动 API 设计
- 尽早引入 memory feedback 机制

---

## 22. 成功标准

GoodMemory 成功，不是因为“有向量库”，而是因为上层产品接入后出现这些结果：

- 用户明显减少重复输入背景信息
- 回答风格更稳定符合用户偏好
- 能正确引用过去的重要讨论
- 上层产品的 prompt 管理变简单
- 成本可控，记忆相关 token 占用下降
- 开发者愿意把它作为默认记忆层集成

---

## 23. 对外宣传语建议

### 版本 1
**GoodMemory — the memory layer for AI apps that actually remembers users.**

### 版本 2
**Plug a real user memory engine into any chatbox or agent.**

### 版本 3
**Beyond vector search: structured, episodic, and contextual memory for AI products.**

---

## 24. 下一步建议

如果继续推进本项目，优先做以下 5 件事：

1. 写出 ADR 与 package 边界
2. 定义 TypeScript 核心接口
3. 先做 Postgres + pgvector 单一参考实现
4. 做一个最小 Next.js chat demo 验证接入体验
5. 做一个 Memory Explorer 调试页

---

## 25. 最终结论

GoodMemory 不应该被设计成“另一个 RAG 库”，而应该被设计成：

> 一个独立的、可插拔的、面向用户长期个性化的 Memory OS。

它的核心不是 embedding 本身，而是：

- 分层记忆模型
- 记忆编译器
- 混合检索
- 上下文压缩
- 可解释和可治理

这才是一个真正能让其他 chatbox / agent 产品安装后明显“更记得住用户”的开源记忆层。

