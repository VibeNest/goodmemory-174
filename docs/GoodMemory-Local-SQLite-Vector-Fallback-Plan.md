# GoodMemory 本地 SQLite 向量回退方案

## 背景

`docs/archive/design-inputs/claude-GoodMemory-Architecture-v0.1.md` 和 `docs/GoodMemory-记忆数据分层设计.md` 都把本地 `SQLite + sqlite-vss` 路线视为重要能力，但当前实现里 `sqlite` 只接了 `documentStore` 和 `sessionStore`。当没有显式提供 `adapters.vectorStore` 时，`createGoodMemory()` 对非 `postgres` 路径会回退到 `createInMemoryVectorStore()`，这会让 `sqlite` 部署的语义检索既不 durable，也和用户选择的存储后端不一致。

## 设计意图

这里要拆成两条独立决策轴：

### 1. storage 决策

- 如果用户显式指定 `sqlite` 或 `postgres`
  - 就严格走显式指定，不做自动切换
- 如果用户没有显式指定
  - 有可用的 Postgres 连接字符串，且目标库的 `pgvector` 可用
    - 默认走 `postgres`
  - 否则
    - 默认走 `sqlite`

这条规则的产品意图是：

- 有现成数据库基础设施的用户，自动得到 provider-backed durable storage
- 没有数据库基础设施的用户，不需要额外安装数据库服务，也可以直接使用 GoodMemory

这里的“无需安装数据库”指的是不需要安装额外的数据库服务器；本地 `sqlite` 是内嵌文件数据库，属于默认本地持久化能力。

### 2. embedding / retrieval 决策

- 如果提供了 `GOODMEMORY_EMBEDDING_*`
  - 就创建 LLM/provider-backed embedding adapter
- 如果没有提供
  - 就保持 `rules-only`

也就是说，embedding 是否启用，不由 `sqlite` / `postgres` 单独决定；它是另一条独立开关。

最终组合结果如下：

- `sqlite` + 无 embedding
  - durable local memory + `rules-only`
- `sqlite` + 有 embedding + 本地向量后端可用
  - durable local memory + local hybrid retrieval
- `postgres` + 无 embedding
  - provider-backed durable memory + `rules-only`
- `postgres` + 有 embedding + `pgvector`
  - provider-backed durable memory + hybrid retrieval

## 设计原则

- 不把顶层 `embedding` 配置重新塞回 `GoodMemoryConfig`
- 不把 extension bootstrap 和记忆语义混成一个概念
- 不在运行失败时假装 semantic recall 仍然生效
- 不破坏现有 `VectorStore` / repository typed hooks / recall trace 语义

## 目标行为

1. 新增 `createSQLiteVectorStore(...)`
2. 新增默认 storage resolver：
   - 显式 `storage.provider` 优先级最高
   - 未显式指定时，`postgres + pgvector` 可用则优先走 `postgres`
   - 否则走 `sqlite`
3. 新增默认 embedding resolver：
   - 有 `GOODMEMORY_EMBEDDING_*` 就创建 embedding adapter
   - 没有则保持 `rules-only`
4. 当最终 storage 解析为 `sqlite` 且没有显式 `adapters.vectorStore` 时，优先解析本地 SQLite 向量后端，而不是默认退回内存向量
5. 本地向量运行时支持三种启动模式：
   - `off`: 明确关闭
   - `prefer`: 可用则启用，不可用则退回 `rules-only`
   - `require`: 启动失败直接报错
6. Bun/macOS 下必须在第一个 `Database` 创建前完成自定义 SQLite library 注入；否则无法加载 SQLite extension
7. 继续只为 `facts`、`references`、`episodes` 建立向量索引，保持和现有 `VectorStore` 契约一致

## 非目标

- 本期不打包本地 embedding model
- 本期不修改稳定 public API 的核心形状
- 本期不把 CLI 或 README 描述成“零配置本地语义检索默认已开启”

## 开发切片

1. 先补默认 storage / embedding resolver 的判定测试
2. 再补 SQLite vector store contract 测试，明确 durable upsert/search/delete 语义
3. 然后实现本地 SQLite vector store 与 extension bootstrap guardrails
4. 再把 `createGoodMemory()` 和 CLI 的默认解析改成：
   - explicit provider 优先
   - auto `postgres`
   - auto `sqlite`
   - `sqlite -> sqlite vector`
5. 最后补 remember / recall / forget / governance 的回归测试与文档同步

## 结论

这条路线本质上是“默认本地可用，基础设施存在时自动升级”。

- storage 维度：优先让用户不用安装数据库服务，也能落到本地 `sqlite`
- embedding 维度：只有在提供 `GOODMEMORY_EMBEDDING_*` 时才开启 semantic retrieval

这样既满足 OSS/local-first，也满足有基础设施时的自动增强。
