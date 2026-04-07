# GoodMemory

GoodMemory 是一个面向 chatbox、copilot、AI agent 等 AI 应用的**可插拔用户记忆层** memory layer。  
它的定位不是 memory database，也不替代： - LLM - agent framework - 向量数据库 - RAG 系统 它专注解决一个更具体的问题： > **如何让任何 chatbox / copilot / agent / workflow assistant 在不重训模型的前提下，真正“记住用户”。** GoodMemory 的核心不是“存更多”，而是： - 记什么 - 何时更新 - 如何检索 - 如何压缩 - 为什么引用 - 如何删除 - 如何控制跨 agent / 跨项目 / 跨租户边界 它的本质是一个： > **Personal Context Engine / Memory Layer for AI Apps**

核心闭环只有 5 件事：

- `remember()`
- `recall()`
- `buildContext()`
- `feedback()`
- `forget()`

## Minimal Usage

```ts
import { createGoodMemory } from "goodmemory";

const memory = createGoodMemory({
  storage: { provider: "memory" },
});

await memory.remember({
  scope: { userId: "u-1", sessionId: "s-1" },
  messages: [
    {
      role: "user",
      content: "Remember that the migration rollout is blocked.",
    },
  ],
});

const recall = await memory.recall({
  scope: { userId: "u-1", sessionId: "s-2" },
  query: "How should I answer this user?",
  retrievalProfile: "general_chat",
});

const context = await memory.buildContext({
  recall,
  output: "markdown",
});
```

## CLI

GoodMemory v1 自带一个只读 CLI，用来查看 eval artifact 和 trace。

```bash
bun run scripts/goodmemory-cli.ts inspect --run-dir reports/eval/live/<run-id> --case-id <case-id>
bun run scripts/goodmemory-cli.ts trace --run-dir reports/eval/live/<run-id> --case-id <case-id>
bun run scripts/goodmemory-cli.ts export --run-dir reports/eval/live/<run-id> --case-id <case-id> --output /tmp/case.json
```

等价脚本：

- `bun run cli -- inspect ...`
- `bun run cli -- trace ...`
- `bun run cli -- export ...`

## Examples

- Basic chat integration: [examples/basic-chat.ts](./examples/basic-chat.ts)
- Coding-agent flavored integration: [examples/coding-agent.ts](./examples/coding-agent.ts)

运行方式：

```bash
bun run example:chat
bun run example:coding-agent
```

## Testing

默认红绿灯：

```bash
bun test
bun run test:coverage
```

说明：

- `bun test`: canonical repository suite，只扫描 `tests/`，与 CI 的 deterministic red/green 对齐
- `bun run test:coverage`: 在同一套 `tests/` 上跑 coverage gate
- `bun run test:all`: 额外扫 `tests/` 之外的 vendored / third-party test trees，只在你明确要做更宽的回归时使用

## Eval

Phase 9 评测链路支持：

- persona dataset
- replay fixtures
- baseline vs GoodMemory A/B
- structured judge output
- raw recall artifact

命令：

```bash
bun run eval:smoke
bun run eval:fallback
bun run eval:live
```

含义：

- `eval:smoke`: 最小 harness 自检，不代表产品评测结果
- `eval:fallback`: deterministic pipeline 验证，不调用真实模型，不可作为产品证据
- `eval:live`: 真实模型生成 + 真实模型 judge 的产品评测入口

`eval:live` 必须显式配置以下环境变量，否则会直接失败：

- `GOODMEMORY_EVAL_PROVIDER`
- `GOODMEMORY_EVAL_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_EVAL_MODEL`
- `GOODMEMORY_EVAL_API_KEY`
- `GOODMEMORY_JUDGE_PROVIDER`
- `GOODMEMORY_JUDGE_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_JUDGE_MODEL`
- `GOODMEMORY_JUDGE_API_KEY`

产物目录：

- live runs: `reports/eval/live/run-*`
- fallback runs: `reports/eval/fallback/run-*`

只有 `reports/eval/live/...` 应被视为产品评测证据。

## Key Docs

- Canonical design: [docs/GoodMemory-First-Principles-and-Reference-Architecture.md](./docs/GoodMemory-First-Principles-and-Reference-Architecture.md)
- v1 implementation architecture: [docs/GoodMemory-OSS-Architecture-v1.md](./docs/GoodMemory-OSS-Architecture-v1.md)
- PRD: [docs/GoodMemory-PRD.md](./docs/GoodMemory-PRD.md)
- TDD and evaluation strategy: [docs/GoodMemory-TDD-and-Evaluation-Strategy.md](./docs/GoodMemory-TDD-and-Evaluation-Strategy.md)
- Release checklist: [docs/GoodMemory-v1-Release-Checklist.md](./docs/GoodMemory-v1-Release-Checklist.md)

## Current Scope

当前实现重点覆盖：

- semantic / episodic / procedural / runtime memory taxonomy
- inspectable recall and eval artifacts
- Phase 9 product evaluation pipeline
- Vercel AI SDK based live eval path

尚未在 v1 完成的内容仍以 task board 为准，入口见 [task-board/00-README.txt](./task-board/00-README.txt)。
