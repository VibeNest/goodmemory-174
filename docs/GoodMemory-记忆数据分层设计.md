# GoodMemory 记忆数据分层设计

状态：Reference Draft（已对齐 Unified Roadmap）

更新日期：2026-04-08

## 1. 这份设计要解决什么问题

当前仓库已经有两类能力：

- `runtime`：`SessionBuffer`、`WorkingMemorySnapshot`、`SessionJournal`、`ArtifactSpillRecord`
- `typed durable memory`：`UserProfile`、`PreferenceMemory`、`ReferenceMemory`、`FactMemory`、`EpisodeMemory`、`FeedbackMemory`

但还缺三层关键能力：

1. 缺少文件系统 artifact plane
   - 现在没有 `user.md`、`MEMORY.md`、`session-memory/<sessionId>.md` 这类人可读、宿主可接入的记忆工件。
2. 缺少 session archive plane
   - 现在有 `episode`，但没有可搜索的跨 session continuity substrate。
3. 缺少 evidence plane
   - 现在 durable memory 主要是结构化结论，缺少与之绑定的原文证据层。

所以问题不是“要不要以文件系统为中心”，而是必须明确区分：

- 什么是 canonical truth
- 什么是 human-readable artifact
- 什么值得做 semantic index
- 什么只属于 runtime continuity
- 什么只属于 archive / evidence / evolution

这份设计的核心裁决是：

> GoodMemory 必须同时按“语义平面”与“持久化表面”两条轴来建模。  
> 同一条记忆可以同时存在于结构化存储、Markdown 镜像、embedding index，  
> 但三者的角色绝不能混在一起。

### 1.1 研究基线

这份方案不是凭空想象，而是综合了四类输入后做的裁决：

- 当前代码库
  - `src/domain/records.ts`
  - `src/remember/engine.ts`
  - `src/recall/engine.ts`
  - `src/runtime/contextService.ts`
  - `src/runtime/spillover.ts`
  - `src/storage/*`
  - `src/maintenance/*`
- `docs/` 现有架构、roadmap、会员模式与 comparative 文档
- `third-party/claude-code-main`
  - session memory
  - auto memory extraction
  - `MEMORY.md` index
  - dream / consolidation
- `third-party/hermes-agent-main`
  - `USER.md / MEMORY.md`
  - provider lifecycle
  - session archive search
  - compression salvage
  - procedural memory as skills
- `third-party/mempalace-main`
  - evidence-first ingest
  - layered recall
  - taxonomy as retrieval primitive
  - graph / entity registry / benchmark-driven iteration

因此这份文档的定位不是“灵感备忘录”，而是后续开发应遵守的数据分层与存储裁决参考。

文档边界：

- 本文负责数据分层、truth source、artifact/storage 角色划分、embedding eligibility 与 recall 分层表达。
- `docs/GoodMemory-Unified-Self-Evolving-Roadmap.md` 负责执行顺序、模块归属、推广门禁与 task-board 对齐。
- 如果两者出现冲突，以 `Unified Roadmap` 为准；本文应回收冲突口径，而不是形成平行路线。

## 2. 设计原则

### 2.1 Core 仍然是 library-first

- `.md` 文件不是 core 的唯一真相源。
- core 的真相源仍应是 typed / scoped / policy-gated / deletable 的结构化记录。
- 文件系统 artifact 是 projection / adapter surface，不反向定义 core schema。

### 2.2 文件系统必须成为正式的一层

- 虽然 `.md` 不是唯一真相源，但它必须是一等工件层。
- 目标不是“把 JSON dump 成 Markdown”，而是让宿主、用户、debugger、导出、迁移都有稳定的人类可读视图。
- `user.md` 必须存在，但它应是 compiled view，不应是唯一 canonical store。

### 2.3 不是所有数据都该 embedding

- embedding 只服务“lexical 不够，但 semantic recall 有价值”的子集。
- 默认不对 `profile`、`preference`、`working memory`、`session journal` 做 embedding。
- 默认 semantic candidate universe 以 `fact`、`reference`、`episode` 为主，后续再逐步纳入 `session archive summary` 和 `evidence shard`。

### 2.4 Evidence 与 archive 不能等于 transcript dump

- 不允许把 full transcript 直接当 evidence plane。
- 不允许把大体量 tool output 原文直接长期写入 evidence plane。
- archive 是 continuity substrate，不是 durable fact store。

### 2.5 Background evolution 必须可治理

- dream / reflection / promotion 不能直接绕过 policy 和 eval 把高风险结果写成 durable truth。
- 后台学习的合法落点应是 proposal / promotion record，而不是直接 silent mutate user-facing memory。

## 3. 两轴模型

## 3.1 轴 A：语义平面

### P0 Runtime Continuity Plane

职责：

- 当前会话态
- 短期 open loops
- 当前任务 handoff
- spillover / compact 辅助状态

代表对象：

- `SessionBuffer`
- `WorkingMemorySnapshot`
- `SessionJournal`
- `ArtifactSpillRecord`

### P1 Typed Durable Plane

职责：

- 可治理的长期结论
- 可 merge / supersede / delete / export 的 durable memory

代表对象：

- `UserProfile`
- `PreferenceMemory`
- `FeedbackMemory`
- `ReferenceMemory`
- `FactMemory`
- `EpisodeMemory`

### P2 Session Archive Plane

职责：

- 保存“上次发生了什么”
- 支撑跨 session continuity
- 不承担 durable fact truth 的职责

代表对象：

- `SessionArchive`

建议字段：

- normalized transcript
- summarized transcript
- key decisions
- unresolved loops
- referenced artifacts
- participants / scope lineage
- compact boundaries
- source session ids

### P3 Evidence Plane

职责：

- 保存 typed durable memory 或 archive 的原文支撑
- 支撑 why / tradeoff / failure context / recall explainability / verification

代表对象：

- `EvidenceRecord`

来源：

- user / assistant conversation excerpt
- high-value tool result excerpt
- doc excerpt
- verification evidence
- correction / failure evidence

### P4 Evolution Control Plane

职责：

- 观察真实使用
- 生成 proposal
- 控制 promotion / rollback

代表对象：

- `ExperienceRecord`
- `LearningProposal`
- `PromotionRecord`

### P5 Derived Procedure Artifact Plane

职责：

- 把 procedural memory 导出为宿主可消费的 artifact
- 例如 playbook / skill / prompt snippet

代表对象：

- `ProcedureArtifact`

注意：

- 它是 derived artifact，不是 core durable truth。
- 近阶段 procedural memory 继续复用 `FeedbackMemory.kind = "validated_pattern"`，`ProcedureArtifact` 只做导出表达。

## 3.2 轴 B：持久化表面

### S1 Structured Canonical Store

推荐形态：

- local: SQLite
- hosted / multi-device: Postgres

职责：

- 真相源
- 强 scope
- lifecycle / supersede / delete
- policy / audit / sync / export

### S2 Markdown Artifact Store

推荐路径：

- `<workspaceRoot>/.goodmemory/memory/`

职责：

- 人类可读
- 宿主可接入
- debug / export / migration / review
- prompt-friendly compact views

裁决：

- 默认是 compiled mirror
- 不是 truth source
- 允许宿主 adapter 提供“文件优先编辑模式”，但不作为 core 默认

### S3 Semantic Index

推荐形态：

- local: in-memory / sqlite-vss / optional local vector
- hosted: pgvector / equivalent vector adapter

职责：

- optional semantic recall
- hybrid lexical + semantic retrieval

裁决：

- semantic index 只索引 eligible 内容
- vector record 是 derived index，不是 primary truth

### S4 Blob / Spill Store

职责：

- 保存大体量原始材料的外置正文
- evidence / spill / archive 只保留 excerpt 与 uri

推荐内容：

- large tool result spill
- raw archive export
- on-demand evidence export

## 4. 真相源裁决

### 4.1 哪一层是 truth source

| 对象 | Truth Source |
| --- | --- |
| Runtime continuity | Structured store |
| Typed durable memory | Structured store |
| Session archive | Structured store |
| Evidence | Structured store + optional blob |
| Markdown files | Never default truth source |
| Embedding index | Never truth source |
| Procedure artifact / skill file | Never default truth source |

### 4.2 `user.md` 的角色

`user.md` 应该存在，但定义为：

- 从 `UserProfile` + 高价值 active `PreferenceMemory` + 高价值 active `FeedbackMemory` 编译出的 compact persona view
- 面向人读、宿主 prompt 装载、手工检查
- 不是唯一的 user truth

这意味着：

- 结构化层负责 `merge/supersede/delete/policy`
- `user.md` 负责“让人看懂系统记住了什么”

## 5. 记录级别存储裁决

| Record / Artifact | Structured Store | Markdown Mirror | Embedding | 默认写入时机 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `SessionBuffer` | 是 | 否 | 否 | 每条消息 / 每次 tool loop | 纯 runtime |
| `WorkingMemorySnapshot` | 是 | 否 | 否 | 每次 runtime patch | 只服务当前 session |
| `SessionJournal` | 是 | 是 | 否 | 每轮任务推进 / pre-compact / explicit update | 镜像到 active session file |
| `ArtifactSpillRecord` | 是 | 否 | 否 | tool output 超预算时 | 正文可落 blob store |
| `UserProfile` | 是 | 是 | 否 | 记住明确 profile signal 时 | 编译进 `user.md` |
| `PreferenceMemory` | 是 | 是 | 否 | 明确、稳定偏好出现时 | rules-first，不默认 embedding |
| `FeedbackMemory` | 是 | 是 | 默认否 | `feedback()` 或 durable correction | `validated_pattern` 后续可选 embedding/export |
| `ReferenceMemory` | 是 | 是 | 是 | durable external pointer 写入时 | 适合 semantic recall |
| `FactMemory` | 是 | 是 | 是 | durable fact 写入时 | active facts 才 eligible |
| `EpisodeMemory` | 是 | 是 | 是 | 完整 query loop / session boundary | 适合 continuity + semantic recall |
| `SessionArchive` | 是 | 是 | 可选 | session end / reset / compaction boundary | continuity substrate |
| `EvidenceRecord` | 是 | 默认否 | 可选 | accepted memory 需要 backing 时 | 不默认全量镜像 |
| `ExperienceRecord` | 是 | 可选 admin export | 否 | remember / recall / verify / maintain 产生 trace 时 | append-only telemetry，不进入用户直接 recall |
| `LearningProposal` | 是 | 可选 admin export | 否 | background review / dream | 不是 user-facing durable truth |
| `PromotionRecord` | 是 | 可选 admin export | 否 | proposal accepted 时 | 审计与 rollback |
| `ProcedureArtifact` | 否，derived | 是 | 否 | promotion / export 时 | 例如 playbook / skill |

## 6. Markdown Artifact 目录设计

默认工作区路径：

```text
<workspaceRoot>/.goodmemory/
  memory.sqlite
  memory/
    MEMORY.md
    user.md
    topics/
      preferences.md
      feedback.md
      references.md
      facts.md
      episodes/
        2026-04.md
    session-memory/
      <sessionId>.md
    archive/
      2026/
        04/
          <sessionId>.md
    playbooks/
      <slug>.md
```

### 6.1 `MEMORY.md`

职责：

- index only
- 不做全量 dump
- 保持低 token、可快速注入

建议规则：

- 上限 200 行
- 上限 25KB
- 每条索引一行
- 优先列出：`user.md`、活跃 topic files、最近 session-memory、最近 archive、playbooks

### 6.2 `user.md`

建议结构：

- Identity
- Expertise
- Current Projects And Goals
- Collaboration Preferences
- Stable Procedural Guidance
- Last Updated / Provenance Summary

来源：

- `UserProfile`
- 稳定 `PreferenceMemory`
- 与协作风格相关的 active `FeedbackMemory`

### 6.3 `topics/*.md`

职责：

- 详细但仍面向人类的 durable memory 主题视图

规则：

- 按类型聚合，不与 canonical row id 绑定文件名
- 文件内部按 active / superseded / archived 分区渲染
- 细节从 structured records 编译，不反向成为主仓

### 6.4 `session-memory/<sessionId>.md`

职责：

- 当前 session 的 handoff / compaction-ready journal artifact

来源：

- `SessionJournal`
- 局部 `WorkingMemorySnapshot`
- 最新 open loops / files / workflow / errors / results

规则：

- 默认只镜像当前 active session
- session 结束后可以转存到 `archive/`

### 6.5 `archive/.../<sessionId>.md`

职责：

- 人类可读的 session archive recap

来源：

- `SessionArchive`

规则：

- 不是完整 transcript dump
- 要有 summary / decisions / unresolved loops / referenced artifacts

### 6.6 `playbooks/<slug>.md`

职责：

- procedural memory 的宿主 artifact

来源：

- `FeedbackMemory(kind = "validated_pattern")`
- `LearningProposal` promotion 结果

裁决：

- playbook/skill file 是 derived export，不是 procedural truth source

## 7. Embedding Eligibility 规则

## 7.1 默认 eligible

- `FactMemory`
- `ReferenceMemory`
- `EpisodeMemory`

## 7.2 后续阶段可纳入

- `SessionArchive.summary`
- `EvidenceRecord`
- `FeedbackMemory(kind = "validated_pattern")`，前提是同时具备 `rule + why + how_to_apply`

## 7.3 默认不纳入

- `UserProfile`
- `PreferenceMemory`
- 普通 `FeedbackMemory`
- `SessionBuffer`
- `WorkingMemorySnapshot`
- `SessionJournal`
- `ArtifactSpillRecord`
- superseded / deleted / inactive records

## 7.4 建议 eligibility 条件

- lifecycle = active
- content 非空且超过最小长度
- 不是近似重复
- 没有被 policy 标记为敏感阻断
- 具备 semantic recall 价值
- 可以回链到 canonical record 或 archive record

## 7.5 融合规则

- lexical exact match 永远优先
- rules-first 结果不能被弱 semantic 邻居挤掉
- semantic recall 只做补充，不替代 scoped / lifecycle / policy gate
- 所有 semantic hit 必须带回 `source record id` 与 `eligibility reason`

## 8. 写入时机设计

## 8.1 每条消息 / 每次 tool loop

写入：

- `SessionBuffer`
- `WorkingMemorySnapshot`
- `ArtifactSpillRecord`

不做：

- durable truth promotion
- embedding

## 8.2 每个完整 query loop 结束后

写入：

- accepted `UserProfile` / `PreferenceMemory` / `FactMemory` / `ReferenceMemory` / `FeedbackMemory`
- 必要时写 `EpisodeMemory`
- 必要时写 `EvidenceRecord`
- 更新相关 Markdown mirror
- 对 eligible 记录写 semantic index

## 8.3 显式 `feedback()`

写入：

- `FeedbackMemory`
- 如符合条件，更新 `user.md` 与 `topics/feedback.md`
- 如形成稳定 workflow，生成或更新 `validated_pattern`

## 8.4 pre-compact / pre-reset / pre-clear

写入：

- `SessionJournal` flush
- 必要的 `EpisodeMemory`
- 必要的 `EvidenceRecord`
- active `session-memory/<sessionId>.md`

目标：

- salvage before loss

## 8.5 session end

写入：

- `SessionArchive`
- archive markdown artifact
- optional final episode consolidation candidate
- optional proposal generation input

## 8.6 background maintenance / dream

可以做：

- dedupe
- contradiction repair
- episode consolidation
- archive hygiene
- evidence link cleanup
- proposal generation
- procedure artifact export

不可以直接做：

- 无 trace 的高风险 durable mutation
- 无 policy / eval gate 的 silent promotion

## 9. Recall 分层设计

统一 recall 层级：

- `L0 Identity / Policy`
  - `UserProfile`
  - active `FeedbackMemory`
  - 少量稳定 preference
- `L1 Durable Working Set`
  - active facts
  - references
  - validated patterns
- `L2 Active Session Continuity`
  - working memory
  - session journal
  - active session episodes
- `L3 Session Archive Recall`
  - cross-session recap
- `L4 Evidence Recall`
  - why / tradeoff / failure context
- `L5 Verification / Authority`
  - 行动前 re-check

统一要求：

- planner 先决定开哪些层
- lexical-first 始终存在
- semantic index 只增强 `L1/L3/L4`
- context builder 必须能解释命中来源

## 10. 何时写结构化、何时写 Markdown、何时写 Embedding

### 10.1 写结构化的判据

满足以下任一条件就应进入 structured canonical store：

- 需要 scope / lifecycle / supersede / delete
- 需要 policy gate
- 需要 sync / audit / export
- 需要 recall scoring
- 需要可验证 provenance link

### 10.2 写 Markdown 的判据

满足以下任一条件就应镜像到 `.md`：

- 用户或宿主需要直接查看
- 适合作为 compact prompt artifact
- 适合作为 workspace-local export / debug / migration 工件
- 适合作为 session handoff 文件

不应默认镜像的内容：

- full transcript
- raw tool output
- 大体量 evidence
- 高敏感、仅机器处理的内部 proposal

### 10.3 做 embedding 的判据

满足全部条件才建议做 embedding：

- 语义检索确实有价值
- 生命周期可控
- 文本足够表达语义
- 不是纯 profile / pure preference / runtime scratchpad
- 能回链到 structured truth

## 11. Authority Modes

### 11.1 默认模式：Structured-Authoritative Mirror

规则：

- structured store 为真相源
- markdown artifact 为 deterministic compiled mirror
- semantic index 为 derived retrieval index

适合：

- GoodMemory core
- library embedding
- 本地 SQLite + hosted sync

### 11.2 可选模式：Host File-Authoritative Adapter

规则：

- 某些宿主可以把 `user.md`、`session-memory/*.md`、`playbooks/*.md` 视为编辑入口
- adapter 负责 parse 文件变更并回写 structured delta

适合：

- Claude Code / Hermes / Codex 风格宿主

裁决：

- 这只能存在于 adapter 层
- 不能反向把 file format 变成 core schema

## 12. 与现有代码的对应关系

当前可直接复用：

- `src/runtime/contextService.ts`
- `src/remember/engine.ts`
- `src/recall/engine.ts`
- `src/recall/router.ts`
- `src/recall/contextBuilder.ts`
- `src/storage/contracts.ts`
- `src/storage/repositories.ts`
- `src/runtime/spillover.ts`
- `src/maintenance/runner.ts`
- `src/maintenance/dream.ts`

需要新增：

- `src/artifacts/`
  - markdown mirror compiler
  - `MEMORY.md` index compiler
  - `user.md` compiler
  - session/archive/playbook renderers
- `src/evidence/`
  - `EvidenceRecord` schema + link + retrieval
- `src/evolution/`
  - `ExperienceRecord` / `SessionArchive` / `LearningProposal` / `PromotionRecord`
  - reviewer / promotion / salvage
- 复用现有 Phase 12 provider / embedding abstraction
  - eligibility
  - index write / delete
  - hybrid recall merge

## 13. 与 Unified Roadmap 的实现顺序对齐

本文不再定义独立 phase。执行顺序统一跟随 `docs/GoodMemory-Unified-Self-Evolving-Roadmap.md` 的 `Roadmap Wave`。

### Wave 0: 口径清理

要求：

- 保持本文只表达分层与存储裁决
- 执行顺序、模块归属、推广门禁以 canonical roadmap 为准

### Wave 1: Observation + Evidence Foundation

要求：

- 先补 `EvidenceRecord`、`ExperienceRecord`、`LearningProposal`、`PromotionRecord`
- 先把 trace、provenance、selective evidence substrate 建起来
- 不把 evidence 退化成 transcript dump

### Wave 2: Session Archive + Continuity Recall

要求：

- 引入 `SessionArchive`
- 支持 searchable archive
- 在 recall 中加入 `L3 Session Archive Recall`

### Wave 3: Hybrid Retrieval over Evidence and Archive

要求：

- 复用现有 Phase 12 provider / embedding abstraction
- 优先接入 `evidence + episodes + archive summary` 的 explainable hybrid retrieval
- `fact/reference` 的既有 eligible 索引规则继续保留，不另起第二套 pipeline

### Wave 4: Reflective Review + Salvage

要求：

- 把 post-turn review、pre-compact salvage、session-end salvage 编译成 proposal
- 后台学习先落 `LearningProposal`，不直接 silent mutate durable state

### Wave 5: Procedural Pattern Promotion + Outcome-Driven Maintenance

要求：

- procedural memory 继续复用 `FeedbackMemory.kind = "validated_pattern"`
- `ProcedureArtifact` 只作为 playbook / skill / prompt snippet 的 derived export
- `dream` 继续做 gate + orchestration，不直接写高风险 durable mutation

### Markdown Artifact Plane：跨 Wave 能力

说明：

- `user.md`
- `MEMORY.md`
- `topics/*.md`
- `session-memory/<sessionId>.md`
- `archive/.../<sessionId>.md`
- `playbooks/<slug>.md`

这些 artifact 仍然是正式能力，但它们属于跨 Wave 的 projection / adapter surface，不再单独定义一条与 canonical roadmap 并行的实现路线。

## 14. 最终裁决

最终推荐的 GoodMemory 分层方案不是三选一，而是四层协同：

1. Structured canonical memory
   - 真相源
2. Markdown artifact memory
   - 人类与宿主接口层
3. Session archive + evidence substrate
   - continuity 与 explainability
4. Selective semantic index
   - recall 增强层

一句话总结：

> `user.md` 应该有。  
> 但它应该是结构化记忆编译出来的 persona artifact。  
> `facts/references/episodes` 应该有结构化真相源。  
> 只有其中一部分再进入 embedding。  
> archive 与 evidence 另外建层，不能继续压扁在现有 typed store 里。
