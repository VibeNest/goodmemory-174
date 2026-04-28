# GoodMemory

语言：[English](./README.md) | 简体中文

GoodMemory 是面向 AI 产品和 coding agent 的记忆层。

它为 chat app、copilot 和 agent host 提供一条可审计的用户/项目记忆闭环：
选择性写入事实，检索正确上下文，注入下一轮对话，记录发生过什么，并在记忆错误时删除。

GoodMemory 不是 LLM、agent framework、向量数据库，也不是通用 RAG 系统。它位于你的应用或已安装 agent host 与模型运行时之间，专注做产品级 memory layer。

## 你会得到什么

- 稳定的记忆 API：`remember`、`recall`、`buildContext`、`feedback`、`forget`、`exportMemory`、`deleteAllMemory`。
- 面向 Codex 和 Claude Code 的已安装 agent 记忆：`goodmemory setup`、托管 hooks、Codex 已安装 pre-action、`goodmemory status`、只读 MCP、可选 writeback。
- 公开的一等写入定制能力：`GoodMemoryConfig.remember`、`RememberProfile`、`rememberRules`、`RememberInput.annotations`、命名 extractor id。
- 面向 npm 包的公开导出：`goodmemory`、`goodmemory/ai-sdk`、`goodmemory/host`、`goodmemory/http`，并提供编译后的 `dist` 与 TypeScript 声明文件。
- Local-first 存储：Bun 默认使用本地 SQLite；需要时可以接 Postgres、注入 adapter、启用 embedding provider。
- 面向发布的验证路径：确定性测试、live eval、provider-backed eval、package smoke、quality gate。

## 选择你的接入路径

GoodMemory 有三类主要产品入口。它不是只有这些 API：`goodmemory/host`、
自定义存储、eval tooling、runtime helper 等底层能力都存在，但它们是服务于
这些主路径的支撑能力，不是新用户首先要选的入口。

### 1. 给其他 agent、chatbox、copilot 接入记忆

适用于你拥有产品 server 和模型调用链的场景。在 Node/Bun 服务里安装
`goodmemory`，创建一个 `memory` 实例，并传入稳定的 `scope`，例如 `userId`、
`workspaceId`、`sessionId`，以及可选 `agentId`。

请求流程是：

1. 模型调用前，用当前 scope 和 query 执行 `recall()`。
2. 用 `buildContext()` 把 recall 命中变成 prompt fragment。
3. 带着这段 memory context 调用你的模型。
4. 响应后，用 `memory.jobs.enqueueRemember()` 或 `remember()` 写入经过筛选的信号。
5. 用 `feedback()`、targeted `reviseMemory()`、`forget()`、`exportMemory()`
   做纠正、删除和用户审计。

如果你的 server 已经使用 Vercel AI SDK，可以通过 `goodmemory/ai-sdk` 包装
`generateText()` 或 `streamText()`，不用手写完整 loop。先看
[应用集成快速开始](#应用集成快速开始)，使用 AI SDK 时再看
[AI SDK Adapter](#ai-sdk-adapter)。

### 2. 给 Codex 或 Claude Code 加强记忆

适用于你想让已安装的 coding agent 记住项目和用户上下文，但不想改 agent
自身实现。安装全局 CLI，然后运行 `goodmemory setup`。

已安装 host 的流程是：

1. `session-start` 和 `user-prompt-submit` hooks 召回 scoped memory。
2. GoodMemory 把压缩后的上下文注入 Codex 或 Claude Code。
3. Codex 的 `pre-tool-use` 会把高风险 Bash 拦到同一条 installed config 和
   storage 路径上的 `goodmemory codex action`。
4. 只读 MCP 提供 trace、context、stats 和 artifact inspection。
5. 可选 writeback 默认是 `off`；先用 `observe` 查看候选，再决定是否进入
   `selective` durable writes。

先看 [快速开始：让 Codex 或 Claude Code 拥有记忆](#快速开始让-codex-或-claude-code-拥有记忆)。
准备 review 或启用写入时，再看 [Installed Host Writeback：已安装主机写回](#installed-host-writeback已安装主机写回)。

### 3. 把 GoodMemory 部署成后端记忆层服务

适用于另一个后端要把 GoodMemory 当服务调用的场景，尤其是 Python/FastAPI
后端，或 OneLife 这类应该把记忆留在服务端、而不是把 GoodMemory 打包进移动端
或浏览器端的产品。

在 Node/Bun sidecar 中部署 packaged `goodmemory-http-bridge`。你的后端调用：

- `/memory/recall-context`：在自己的模型调用前取 prompt-ready context
- `/memory/remember`：写入用户确认或产品策略允许的信号
- `/memory/feedback`：记录 procedural correction
- `/memory/export` 和 `/memory/forget`：做审计和删除
- `/memory/revise`：按显式 memory id 做 targeted correction

你的服务仍然负责 auth、产品策略、UI 和模型编排。GoodMemory 负责 memory
storage、recall、context assembly、write governance，以及 audit/export/delete。
先看 [Python/FastAPI HTTP Bridge](#pythonfastapi-http-bridge)，再看
[Runtime 与存储](#runtime-与存储) 选择 SQLite/Postgres。

在一轮模型调用中，GoodMemory 做四件事：

1. 按当前 `scope` 解析记忆。
2. 生成可以直接放进 prompt 的上下文片段。
3. 在你的应用或 host 允许时，记录经过筛选的响应后信号。
4. 提供审计、纠正、导出和删除路径，让用户能控制记忆。

你的应用或已安装 agent 仍然负责 auth、UI、model call 和产品策略。
GoodMemory 负责 memory loop 和存储边界。

## 安装

GoodMemory `0.2.2` 有两条常用安装路径。

如果你想给已安装的 coding agent 增加记忆能力，使用全局 CLI：

```bash
npm install -g goodmemory@0.2.2
goodmemory setup
goodmemory status
```

如果你是在应用里集成 GoodMemory，作为项目依赖安装：

```bash
npm install goodmemory@0.2.2
```

Bun 项目可以直接安装：

```bash
bun add goodmemory@0.2.2
```

发布前 tarball 验证：

```bash
npm install ./goodmemory-0.2.2.tgz
```

已安装 CLI 的非版本命令由 Bun 支撑。package bin 对 `goodmemory -V` 和 `goodmemory --version` 是 Node-safe 的；其他命令会委托给 Bun。

## 快速开始：让 Codex 或 Claude Code 拥有记忆

大多数用户最先需要的是 installed-host memory。

```bash
npm install -g goodmemory@0.2.2
goodmemory setup
goodmemory status
```

`goodmemory setup` 会检测 Codex 和 Claude Code，安装托管 host wiring，并交互式询问：

- host：`codex`、`claude`，或检测到的两个 host
- activation：全局启用、当前 workspace 启用，或手动 opt-in
- GoodMemory user id
- 可选 Postgres 存储
- 可选 embedding provider
- 可选 LLM extraction provider
- writeback 模式：`off`、`observe`、`selective`

交互式 setup 默认走全局 activation，并使用 workspace 派生隔离。对新的 host config，交互式流程会推荐 `observe`，让用户先查看 writeback 候选，再决定是否启用 durable 写入；已有 host config 在接受 prompt 默认值时会保持当前 writeback 模式。自动化安装可以使用 `--json` 或 `--no-interactive` 保持脚本安全。跳过 provider 配置也可以：GoodMemory 仍然会使用本地 SQLite 和 rules-only extraction 工作。

常用命令：

```bash
goodmemory setup --host codex
goodmemory status codex --workspace-root .
goodmemory enable codex --workspace-root . --writeback observe
goodmemory enable codex --workspace-root . --writeback selective
goodmemory disable codex --workspace-root .
goodmemory uninstall codex
```

已安装 host 路径由四部分组成：

- Codex 托管 pre-action：`pre-tool-use` 会 deny 或 redirect 高风险 Bash，
  `goodmemory codex action` 在和 recall/writeback 相同的 installed
  config、storage、provider、scope 路径上执行经过评估的 first step。
- Recall injection：`session-start` 和 `user-prompt-submit` hooks 调用 `recall()` 与 `buildContext()`；当配置、解析或存储不可用时 fail open。
- 深度 inspection：`goodmemory mcp serve --host codex` 和 `goodmemory-mcp --host codex` 暴露只读 context、trace、stats 与 artifact tools。
- 可选 writeback：`session-stop` 与显式 writeback 命令可以把经过筛选的 after-response 信号写入 durable memory。

## Installed Host Writeback：已安装主机写回

Installed Host Writeback 是 opt-in 的。runtime 默认配置和新的脚本化安装在没有显式选择时仍保持 `off`；已有配置在没有显式 override 时保持当前 writeback 模式，可能是 `off`、`observe` 或 `selective`。新的交互式安装会推荐 `observe`，让候选先可见，而不是直接写入长期记忆。

先用 `observe`，再考虑 `selective`：

```bash
goodmemory enable codex --writeback observe
goodmemory codex writeback --json

goodmemory enable codex --writeback selective
goodmemory codex writeback --json
```

writeback 规则：

- `off`：不做 after-response 记忆抽取。
- `observe`：把有界/redacted candidate preview 写入本地 audit ledger 供 review；不保存 raw transcript，也不写 durable memory。
- `selective`：把选中的候选通过公开 `remember` surface 写入。
- 原始 transcript 不会被当作 memory 持久化。
- assistant 产出的内容默认不能直接成为 durable memory；除非 host 明确确认或验证，并且当前 profile 允许。
- `remember: "never"` 会在 deterministic、custom、assisted extraction 之前屏蔽被标注内容。

审计和撤销：

```bash
goodmemory codex writeback inspect --json
goodmemory codex writeback forget --event-id <event-id> --review-outcome false_write
```

audit ledger 保存有界的 redacted candidate preview、candidate key、类型化 linked record id、状态、原因、host、mode、时间戳、scope/session digest，以及可选人工 review 元数据。它不保存原始 host payload。`forget --event-id` 会先通过公开 `forget()` 删除 durable audit event 的 linked memory/evidence records，再把事件标记为 forgotten；对 observe-only event，它只会标记为 dismissed，不调用 `forget()`。

Claude Code 对 hook 和 writeback 命令有确定性 CLI parity；Codex 是当前 canonical live-evidence path。

## 脚本化 Host 安装

当你需要完全非交互安装时，使用 `goodmemory install <host>`：

```bash
goodmemory install codex \
  --user-id <user-id> \
  --activation-mode global \
  --writeback observe \
  --storage-provider postgres \
  --storage-url "postgres://user:pass@host:5432/goodmemory" \
  --embedding-provider openai \
  --embedding-model text-embedding-3-small \
  --embedding-api-key <key> \
  --llm-provider openai \
  --llm-model gpt-4o-mini \
  --llm-api-key <key> \
  --no-interactive
```

托管配置位于 `~/.goodmemory/<host>.json`。带 provider flags 重复运行 install 会更新同一个配置，并保持 MCP/hook 注册幂等。卸载 npm 包不会删除 `~/.goodmemory`、repo-local `.goodmemory`、本地 SQLite 文件或远端 Postgres 数据。使用 `goodmemory uninstall <host>` 移除托管 host wiring；使用 `goodmemory forget ...` 或显式存储删除来移除记忆数据。

## 应用集成快速开始

当你在构建 chatbox、copilot 或产品 agent 时，使用 root package。更完整的
应用接入路径见
[docs/GoodMemory-15-Minute-App-Integration.md](./docs/GoodMemory-15-Minute-App-Integration.md)。

```ts
import type { GoodMemoryTraceSpan } from "goodmemory";
import { createGoodMemory } from "goodmemory";

const traceSpans: GoodMemoryTraceSpan[] = [];

const memory = createGoodMemory({
  observability: {
    traceSink: {
      emit(span) {
        traceSpans.push(span);
      },
    },
  },
});

const scope = {
  userId: "u-1",
  workspaceId: "workspace-a",
  sessionId: "s-1",
};
const userMessage = "Remember that the migration rollout is blocked on QA signoff.";

// 产品打开新 session 时调用一次 startSession；同一个 sessionId 的后续 turn
// 继续 append 到已有 runtime state。
await memory.runtime.startSession({ scope });
await memory.runtime.appendMessage({
  scope,
  message: {
    role: "user",
    content: userMessage,
  },
});

const recall = await memory.recall({
  scope,
  query: "What should the assistant know before replying?",
  retrievalProfile: "general_chat",
});

const context = await memory.buildContext({
  recall,
  output: "system_prompt_fragment",
});

const assistantText = await callYourModel({
  memoryContext: context.content,
  userMessage,
});

await memory.runtime.appendMessage({
  scope,
  message: {
    role: "assistant",
    content: assistantText,
  },
});

const writeJob = await memory.jobs.enqueueRemember({
  scope,
  messages: [
    {
      role: "user",
      content: userMessage,
    },
    {
      role: "assistant",
      content: assistantText,
    },
  ],
  idempotencyKey: "turn-1",
  reason: "post_response_memory_write",
});
const drained = await memory.jobs.drain({ maxJobs: 1 });
const committedJob =
  drained.jobs.find((job) => job.jobId === writeJob.jobId) ?? writeJob;

console.log({
  traceCount: traceSpans.length,
  writeJobId: writeJob.jobId,
  writeJobStatus: committedJob.status,
});

async function callYourModel(input: {
  memoryContext: string;
  userMessage: string;
}): Promise<string> {
  void input.memoryContext;
  return `Got it. I will keep that in mind: ${input.userMessage}`;
}
```

核心记忆闭环保持很小：

- `remember()` 写入经过筛选的用户、应用或 host 信号。
- `recall()` 按 scope 和 query 检索记忆。
- `buildContext()` 把 recall 命中转换成 prompt fragment 或 JSON payload。
- `feedback()` 记录显式纠正和过程偏好。
- `forget()` 删除错误或过期记忆。

生产应用接入时，推荐的 turn loop 会在这个核心闭环外增加受治理的
runtime 层：

- `memory.runtime.startSession()` 和 `memory.runtime.appendMessage()` 维护
  当前 session 状态，不把 raw transcript 当作默认 durable memory。
- `memory.jobs.enqueueRemember()` 用 idempotency 和可见 job 状态安排
  after-response 写入。
- `memory.jobs.drain()` 在当前 in-memory scheduler 中提交队列写入；生产
  服务应放在 worker 或请求相邻 job loop 中执行。
- `GoodMemoryConfig.observability.traceSink` 接收 redaction-safe trace，
  覆盖 remember、recall、context、revise、forget、export 和 job events。
- `memory.reviseMemory({ target: { memoryId } })` 只按显式 `memoryId`
  修正已知记忆，不做模糊文本选中。
- `exportMemory()` 提供用户可审计、可导出的记忆视图。

Runtime archive 默认不持久化。显式调用
`memory.runtime.endSession({ scope, archive: "off" })` 会清理 session state，
但不会写入 archive。即使产品选择启用 archive，也应保持 summary-only，
不要把 raw transcript 当作默认记忆来源。

## Runtime 与存储

`createGoodMemory({})` 遵循 local-first auto-storage contract：

- 显式传入 `storage.provider` 时，以显式配置为准。
- 没有显式 storage 时，只有配置目标可以 bootstrap GoodMemory backend，才会使用 Postgres。
- 在 Bun 上，零配置 durable storage 是本地 SQLite：`./.goodmemory/memory.sqlite`。
- 在没有内置本地 SQLite adapter 的 Node runtime 上，零配置 storage 会 fallback 到 in-memory。
- 不可用的内置 `sqlite` 或 `postgres` 显式选择会被报告为 unavailable，不会被误标成 durable。
- 注入的 `documentStore`、`sessionStore`、`vectorStore` adapter 会被报告为 adapter-defined storage。
- 没有 `GOODMEMORY_EMBEDDING_*` 时，运行时保持 `rules-only`。
- 支持的本地 runtime 可以用 `sqlite-vss` 做 SQLite semantic indexing；不支持时仍保留 durable non-accelerated fallback。

不要猜 runtime，直接检查：

```ts
import { createGoodMemory, inspectGoodMemoryRuntime } from "goodmemory";

const memory = createGoodMemory({});
const runtime = inspectGoodMemoryRuntime(memory);

console.log(runtime.storage);
```

SQLite vector 控制项：

- `GOODMEMORY_SQLITE_VECTOR_MODE=off|prefer|require`
- `GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH`
- `GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH`
- `GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT`
- `GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION`

## 公开写入定制

产品集成应该通过公开 `remember` surface 定制写入。不要把 test-only extractor seam 用作产品行为。

```ts
import { createGoodMemory, rememberRules } from "goodmemory";

const memory = createGoodMemory({
  remember: {
    preset: "default",
    profiles: [
      {
        id: "life-coach",
        when: { agentId: "life-coach" },
        rules: [
          rememberRules.fact(/my top priority this quarter is (.+)/i, {
            id: "life-goal-priority",
            category: "goal",
            tags: ["life_coach", "long_term_goal"],
            attributes: { horizon: "quarter" },
            content: ({ match }) => match[1] ?? "",
          }),
          rememberRules.preference(/please coach me with (.+)/i, {
            id: "life-coaching-style",
            category: "coaching_style",
            value: ({ match }) => match[1] ?? "",
          }),
        ],
        assistantOutputs: { mode: "confirmed_or_verified_only" },
      },
    ],
  },
});

await memory.remember({
  scope: { userId: "u-1", agentId: "life-coach" },
  messages: [
    {
      role: "user",
      content: "My top priority this quarter is rebuilding my sleep routine.",
    },
  ],
  annotations: [
    {
      messageIndex: 0,
      remember: "always",
      metadataPatch: { tags: ["confirmed_by_host"] },
    },
  ],
});
```

Profile `extractors` 可以是原始 `MemoryExtractor`，也可以是命名 `{ id, extractor }`。真实产品集成建议使用命名 extractor，这样 remember events 和 eval reports 即使在 profile 组合顺序变化后，也能保留稳定 `extractorIds`。Remember events 也会携带解析后的 `profileId` 与 `presetId` 元数据。

## AI SDK Adapter

GoodMemory 的 Node-compatible AI SDK 路径是一个普通 `Request -> Response` server handler，由 `createGoodMemory()` 和 `createGoodMemoryAISDK()` 组合而成。

```ts
import { createGoodMemory } from "goodmemory";
import type { GoodMemoryStreamTextInput } from "goodmemory/ai-sdk";
import { createGoodMemoryAISDK } from "goodmemory/ai-sdk";

const memory = createGoodMemory({});

const aiSDK = createGoodMemoryAISDK({
  memory,
});

type MemoryChatRequest = Pick<
  GoodMemoryStreamTextInput,
  "messages" | "query" | "scope" | "system"
>;

function isMemoryChatRequest(value: unknown): value is MemoryChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const scope = candidate.scope;
  return Array.isArray(candidate.messages)
    && !!scope
    && typeof scope === "object"
    && !Array.isArray(scope)
    && typeof (scope as { userId?: unknown }).userId === "string"
    && (scope as { userId: string }).userId.trim().length > 0;
}

export async function handleMemoryChat(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isMemoryChatRequest(body)) {
    return new Response(
      JSON.stringify({
        error: "Expected a request body with a messages array and scope.userId.",
      }),
      {
        headers: { "content-type": "application/json; charset=utf-8" },
        status: 400,
      },
    );
  }

  const result = aiSDK.streamText({
    messages: body.messages,
    query: body.query,
    scope: body.scope,
    system: body.system,
    model: {} as never,
  });

  return result.toTextStreamResponse();
}
```

说明：

- canonical server example 是 [examples/plain-ai-sdk-server.ts](./examples/plain-ai-sdk-server.ts)。
- `examples/vercel-ai-chat.ts` 保留为更底层的 wrapper/API 示例。
- Next.js App Router 可以把 `export async function POST(request: Request)` 映射到同一段 handler 逻辑。
- 第一条公开 server path 是 `ModelMessage`-first。
- wrapper 通过 `recall()` 与 `buildContext()` 增强 `system`，并在 memory layer 出错时 soft-fail。

## Python/FastAPI HTTP Bridge

当 Python 后端需要把 GoodMemory 当作服务端 memory service 调用时，使用已打包的 HTTP bridge：

```bash
GOODMEMORY_HTTP_BRIDGE_TOKEN="replace-with-service-token" \
GOODMEMORY_STORAGE_PROVIDER=postgres \
GOODMEMORY_STORAGE_URL="postgres://user:pass@host:5432/goodmemory" \
./node_modules/.bin/goodmemory-http-bridge --profile life-coach
```

Python 调用方发送 `Authorization: Bearer <token>` 和 `x-goodmemory-*` scope
headers，调用 `POST /memory/recall-context`、`/memory/remember`、
`/memory/feedback`、`/memory/export`、`/memory/forget`，以及只接受显式
`memoryId` 的 `/memory/revise`。TypeScript bridge API 从 `goodmemory/http`
导入。

## Host Adapter API

当外部 host 需要 artifact 或 host-specific contracts，但不想导入内部模块时，使用 `goodmemory/host`。

```ts
import { createGoodMemory } from "goodmemory";
import { createHostAdapter } from "goodmemory/host";

const memory = createGoodMemory({});

const adapter = createHostAdapter({
  id: "codex-handoff",
  hostKind: "codex",
  memory,
  readableArtifactTypes: ["session_memory"],
});

const result = await adapter.readArtifacts({
  scope: {
    userId: "u-1",
    workspaceId: "workspace-a",
    sessionId: "s-1",
  },
  includeRuntime: true,
});
```

模式：

- `file-assisted`：读取编译出的 artifacts，例如 `MEMORY.md`、`user.md`、`session-memory/<sessionId>.md`、`playbooks/*.md`，但不把文件当作 canonical storage。
- `file-authoritative`：可用于最小 writable subset。当前 subset 是 canonical `playbooks/*.md` 文件形态，会把结构化 deltas 写回 active validated-pattern feedback records。

写入 guardrails：

- prompt 和 skill snippet 文件仍然是 derived read-only outputs。
- 高风险 guidance edit 需要显式 `verifyWrite` approval。
- `appliesTo`、`Why` 这类低风险 metadata edit 可以不经过额外 approval。
- 失败的 writable operation 会返回 diagnostics 与 rollback guidance。

当前 Claude/Codex 示例默认保持在 `file-assisted` 模式。

## CLI Reference

公开 installed-package CLI contract 是 package bin `goodmemory`。在本地 dependency install 里，用 `./node_modules/.bin/goodmemory` 调用。repo-local `bun run goodmemory` 只用于开发。

Memory-first commands：

```bash
./node_modules/.bin/goodmemory inspect --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory trace --user-id <user-id> --workspace-id <workspace-id> --query "Which runbook is the source of truth?"
./node_modules/.bin/goodmemory export-memory --user-id <user-id> --workspace-id <workspace-id> --output ./tmp/export
./node_modules/.bin/goodmemory stats --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory remember --user-id <user-id> --workspace-id <workspace-id> --session-id <session-id> --message "Remember that the deploy is blocked on smoke verification."
./node_modules/.bin/goodmemory feedback --host codex --workspace-root . --session-id <session-id> --signal "Keep coding summaries short and list explicit next steps."
./node_modules/.bin/goodmemory forget --host codex --workspace-root . --session-id <session-id> --memory-id <memory-id>
```

Installed-host commands：

```bash
./node_modules/.bin/goodmemory -V
./node_modules/.bin/goodmemory --version
./node_modules/.bin/goodmemory setup --host codex
./node_modules/.bin/goodmemory status codex --workspace-root .
./node_modules/.bin/goodmemory install codex --activation-mode global --writeback observe --user-id <user-id>
./node_modules/.bin/goodmemory enable codex --workspace-root . --writeback selective
./node_modules/.bin/goodmemory mcp serve --host codex
./node_modules/.bin/goodmemory-mcp --host codex
./node_modules/.bin/goodmemory codex bootstrap --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory claude bootstrap --user-id <user-id> --workspace-id <workspace-id>
```

Hook 与 writeback 示例：

```bash
printf '%s' '{"cwd":".","session_id":"s-1","hook_event_name":"SessionStart","source":"startup"}' \
  | ./node_modules/.bin/goodmemory codex hook session-start

printf '%s' '{"cwd":".","session_id":"s-1","tool_name":"Bash","tool_input":{"command":"./tools/DeepAnalyzer --detailed"}}' \
  | ./node_modules/.bin/goodmemory codex hook pre-tool-use

./node_modules/.bin/goodmemory codex action -- ./tools/DeepAnalyzer --detailed

printf '%s' '{"cwd":".","session_id":"s-1","messages":[{"role":"user","content":"Next step is to finish the release smoke."}]}' \
  | ./node_modules/.bin/goodmemory codex writeback --json

printf '%s' '{"cwd":".","session_id":"s-1","event_id":"stop-1","summary":"Keep coding summaries short."}' \
  | ./node_modules/.bin/goodmemory codex hook session-stop
```

Eval artifact inspection：

```bash
./node_modules/.bin/goodmemory eval inspect --run-dir reports/eval/live/<run-id> --case-id <case-id>
./node_modules/.bin/goodmemory eval trace --run-dir reports/eval/live/<run-id> --case-id <case-id>
./node_modules/.bin/goodmemory eval export-case --run-dir reports/eval/live/<run-id> --case-id <case-id> --output /tmp/case.json
```

CLI surface：

- `goodmemory -V`
- `goodmemory --version`
- `goodmemory setup`
- `goodmemory status`
- `goodmemory install`
- `goodmemory uninstall`
- `goodmemory enable`
- `goodmemory disable`
- `goodmemory inspect`
- `goodmemory trace`
- `goodmemory export-memory`
- `goodmemory stats`
- `goodmemory remember`
- `goodmemory feedback`
- `goodmemory forget`
- `goodmemory mcp serve`
- `goodmemory-mcp`
- `goodmemory codex hook`
- `goodmemory codex writeback`
- `goodmemory claude hook`
- `goodmemory claude writeback`
- `goodmemory codex bootstrap`
- `goodmemory claude bootstrap`
- `goodmemory eval inspect`
- `goodmemory eval trace`
- `goodmemory eval export-case`

## 示例

installed-package guides：

- Reference integration guide：[docs/GoodMemory-Reference-Integration-Guide.md](./docs/GoodMemory-Reference-Integration-Guide.md)
- Codex handoff setup guide：[docs/GoodMemory-Codex-Handoff-Setup-Guide.md](./docs/GoodMemory-Codex-Handoff-Setup-Guide.md)
- Claude Code setup guide：[docs/GoodMemory-Claude-Code-Setup-Guide.md](./docs/GoodMemory-Claude-Code-Setup-Guide.md)

repo-local examples：

- Basic chat integration：[examples/basic-chat.ts](./examples/basic-chat.ts)
- Coding-agent flavored integration：[examples/coding-agent.ts](./examples/coding-agent.ts)
- Plain AI SDK server integration：[examples/plain-ai-sdk-server.ts](./examples/plain-ai-sdk-server.ts)
- AI SDK wrapper integration：[examples/vercel-ai-chat.ts](./examples/vercel-ai-chat.ts)
- Life-coach public remember profile：[examples/life-coach-remember-profile.ts](./examples/life-coach-remember-profile.ts)
- Claude-style host artifact consumption：[examples/host-claude-artifacts.ts](./examples/host-claude-artifacts.ts)
- Codex-style session handoff consumption：[examples/host-codex-handoff.ts](./examples/host-codex-handoff.ts)

从当前 repo 运行示例：

```bash
bun run example:chat
bun run example:coding-agent
bun run example:ai-sdk-server
bun run example:vercel-ai
bun run example:life-coach-profile
bun run example:host-claude
bun run example:host-codex
```

## Testing And Eval

默认本地 gates：

```bash
bun test
bun run typecheck
bun run test:coverage
```

只有当你明确需要覆盖 vendored 或 third-party test trees 时，才使用 `bun run test:all`。

Eval commands：

```bash
bun run eval:smoke
bun run eval:fallback
bun run eval:live
bun run eval:live-memory
bun run eval:live-auto-memory
bun run eval:live-provider-memory
bun run eval:summary
```

含义：

- `eval:smoke`：harness 自检。
- `eval:fallback`：不调用 live model 的确定性验证。
- `eval:live`：live generator 加 live judge，使用 in-memory backend。
- `eval:live-memory`：live generator 加 live judge，使用 auto-storage 语义；默认是本地 SQLite，除非 provider storage 可解析。
- `eval:live-auto-memory`：`eval:live-memory` 的显式 alias，方便脚本表达 auto-storage。
- `eval:live-provider-memory`：provider-backed evidence path，需要 Postgres、embeddings 与 assisted extraction；不会静默 fallback 到 SQLite。
- `eval:summary`：汇总已有 eval output directories。

Live eval 环境变量：

- `GOODMEMORY_EVAL_PROVIDER`
- `GOODMEMORY_EVAL_BASE_URL`，用于 OpenAI-compatible gateways
- `GOODMEMORY_EVAL_MODEL`
- `GOODMEMORY_EVAL_API_KEY`
- `GOODMEMORY_EVAL_MAX_CONCURRENCY`，可选并发上限
- `GOODMEMORY_JUDGE_PROVIDER`
- `GOODMEMORY_JUDGE_BASE_URL`，用于 OpenAI-compatible gateways
- `GOODMEMORY_JUDGE_MODEL`
- `GOODMEMORY_JUDGE_API_KEY`

`eval:live-memory` 和 `eval:live-auto-memory` 还需要 embedding 与 assisted extractor 配置：

- `GOODMEMORY_EMBEDDING_PROVIDER`
- `GOODMEMORY_EMBEDDING_BASE_URL`，用于 OpenAI-compatible gateways
- `GOODMEMORY_EMBEDDING_MODEL`
- `GOODMEMORY_EMBEDDING_API_KEY`
- `GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER`
- `GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL`，用于 OpenAI-compatible gateways
- `GOODMEMORY_ASSISTED_EXTRACTOR_MODEL`
- `GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY`

`eval:live-provider-memory` 额外需要：

- `GOODMEMORY_TEST_POSTGRES_URL`

输出目录：

- live runs：`reports/eval/live/run-*`
- auto-storage live memory runs：`reports/eval/live-memory/run-*`
- provider-backed live memory runs：`reports/eval/live-provider-memory/run-*`
- fallback runs：`reports/eval/fallback/run-*`

## Strategy Rollout

GoodMemory 把 `rules-only` 保持为受支持 baseline。新的 retrieval behavior 需要按 `observe -> assist -> promote` 推进。

Operator guidance：

- `observe`：收集隔离 shadow evidence，不改变实际执行路径。
- `assist`：只在受控 eval runs 里允许 candidate execution。
- `promote`：需要 `strategy-promotion-gate.json`、干净的 `regression-dashboard.json`，以及 `strategy-promotion-authorization.json`。
- 当 eval evidence 不完整、provider-backed dependencies 不可用，或 rollback 条件存在时，保持 `rules-only`。

## 当前状态

当前稳定公开 surface：

- 通过 `goodmemory` 暴露 root memory API
- 通过 `goodmemory/ai-sdk` 暴露 AI SDK adapter
- 通过 `goodmemory/host` 暴露 host adapter 和 host contracts
- 通过 `goodmemory/http` 和 `goodmemory-http-bridge` 暴露 HTTP bridge
- 通过 `goodmemory setup` 暴露 installed CLI 和托管 host setup
- Codex 与 Claude Code hooks 用于 recall
- 只读 MCP 用于 inspection 和 debugging
- opt-in installed-host writeback，带 audit 和 undo
- Bun 上的本地 SQLite durable fallback
- 配置后可用 Postgres、embeddings、assisted extraction、provider-backed evals

仍然不属于已接受公开承诺：

- 默认开启 automatic writeback
- 原始 transcript archive
- dashboard 或 managed cloud
- 把导出的 artifact files 当作 canonical storage
- 用内部 proposal 或 promotion internals 扩大 root exports

详细当前状态和 evidence map 见 [docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md)。

## 文档

- 当前状态与 evidence：[docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md)
- canonical design：[docs/GoodMemory-First-Principles-and-Reference-Architecture.md](./docs/GoodMemory-First-Principles-and-Reference-Architecture.md)
- v1 implementation architecture：[docs/GoodMemory-OSS-Architecture-v1.md](./docs/GoodMemory-OSS-Architecture-v1.md)
- PRD：[docs/GoodMemory-PRD.md](./docs/GoodMemory-PRD.md)
- TDD 与 evaluation strategy：[docs/GoodMemory-TDD-and-Evaluation-Strategy.md](./docs/GoodMemory-TDD-and-Evaluation-Strategy.md)
- Strategy rollout guide：[docs/GoodMemory-Strategy-Rollout-Guide.md](./docs/GoodMemory-Strategy-Rollout-Guide.md)
- Release checklist：[docs/GoodMemory-v1-Release-Checklist.md](./docs/GoodMemory-v1-Release-Checklist.md)
- 历史 quality-gate archive：[docs/archive/quality-gates/README.md](./docs/archive/quality-gates/README.md)
- 历史 v1 snapshot：[docs/GoodMemory-v1-Quality-Gate.md](./docs/GoodMemory-v1-Quality-Gate.md)

执行顺序、后续开放工作和 phase-specific acceptance boundaries 见 [task-board/00-README.txt](./task-board/00-README.txt)。
