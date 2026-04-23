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

const memory = createGoodMemory({});

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

## Public Remember Customization

Domain-specific writes are configured through the public `remember` surface on
`createGoodMemory`. Use profiles and rules when a host knows what should become
durable memory for a specific agent or domain. Do not use `testing.extractor`
for product integrations; that seam is for tests.

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

Assistant messages are ignored by default for durable writes. To make an
assistant-originated suggestion durable, the host must annotate the message and
the selected profile must allow confirmed or verified assistant output.
`remember: "never"` suppresses the annotated message before deterministic,
custom, or assisted extraction.

Profile `extractors` can be supplied either as raw `MemoryExtractor` objects or
as `{ id, extractor }` entries. Use the named form for product integrations so
remember events and eval reports carry stable `extractorIds` even if the profile
composition order changes. Named ids must be non-blank, unique within the
resolved profile, and outside the generated raw-extractor id namespace
`${profileId}:extractor-N`; invalid ids fail during profile resolution.
Remember events also carry the resolved `profileId` and `presetId` for default,
custom, assisted, and annotation-derived writes.

## Install

GoodMemory `0.1.1` now exposes a Node-compatible packaged library boundary for:

- `goodmemory`
- `goodmemory/ai-sdk`
- `goodmemory/host`

The installed CLI remains Bun-backed today.

Published install:

```bash
npm install goodmemory@0.1.1
```

Bun install:

```bash
bun add goodmemory@0.1.1
```

Tarball verification for release rehearsal before publish:

```bash
npm install ./goodmemory-0.1.1.tgz
```

The default runtime contract stays low-friction:

- `createGoodMemory({})`
- explicit storage config still wins when provided
- without explicit storage, GoodMemory prefers a bootstrappable Postgres target
- on Bun, the zero-config local durable fallback remains `./.goodmemory/memory.sqlite`
- on Node runtimes without the built-in local SQLite adapter, the zero-config fallback is in-memory
- explicit built-in `sqlite` / `postgres` storage on unsupported runtimes is reported as unavailable, not durable
- when `documentStore` / `sessionStore` / `vectorStore` are injected, runtime inspection reports adapter-defined storage instead of guessing built-in durability
- without `GOODMEMORY_EMBEDDING_*`, runtime stays `rules-only`

If your integration cares about durability, inspect the resolved runtime after
construction instead of assuming Bun-style local persistence:

```ts
import { createGoodMemory, inspectGoodMemoryRuntime } from "goodmemory";

const memory = createGoodMemory({});
const runtime = inspectGoodMemoryRuntime(memory);
```

## CLI

GoodMemory `0.1.1` 自带一个 Bun-backed 的已安装 CLI。包里的 `goodmemory` bin 现在可以在 Node 包安装场景下安全暴露；真正执行命令时会委托给 Bun。稳定的 memory-first 命令仍然是 `inspect` / `trace` / `export-memory` / `stats` / `eval ...`。显式 `--storage-provider` / `--storage-url` 优先；不显式指定时，会优先尝试可用的 Postgres 目标，否则在 Bun 运行时回落到当前工作目录下的 sqlite：`./.goodmemory/memory.sqlite`。这些 memory-first 根命令只会读取已有存储；如果最终解析到的本地 sqlite 不存在，CLI 会报错而不会隐式创建本地数据库。唯一的策略诊断例外是 `trace --ignore-memory`：它会把 recall 视为空集并直接跳过存储解析。

Version checks are intentionally lightweight and follow the normal package-bin
contract:

```bash
./node_modules/.bin/goodmemory -V
./node_modules/.bin/goodmemory --version
```

The installed Node wrapper answers version queries directly without launching
Bun. Other CLI commands still delegate to Bun.

Phase 35 installed-host middleware commands are now part of the accepted stable host surface. This includes `goodmemory install|uninstall <codex|claude>` and `goodmemory enable|disable <codex|claude>` for managed host config, repo-local opt-in, MCP registration, and hook wiring. The lower-level `goodmemory codex bootstrap` / `goodmemory claude bootstrap` commands remain supported compatibility paths for artifact-first integrations.

The installed hook runtime commands are the canonical always-on recall path when a repository is explicitly enabled: `goodmemory codex hook <session-start|user-prompt-submit>` and `goodmemory claude hook <session-start|user-prompt-submit>`. They read host hook JSON from stdin, use the existing `recall()` + `buildContext()` path, and fail open when config, opt-in, parsing, or recall is unavailable.

The read-only MCP surface is accepted for deep read, debug, and artifact browsing: `goodmemory mcp serve --host <codex|claude>` and `goodmemory-mcp --host <codex|claude>`. MCP does not replace hook-time recall injection or the Phase 34 host pre-action path.

The explicit write CLI commands `goodmemory remember`, `goodmemory feedback`, and `goodmemory forget` are accepted for installed-host seeding and correction. They do not add automatic writeback, transcript persistence, or a stop-hook memory path.

Installed-host setup is designed as a closed loop. `goodmemory install <codex|claude>`
always succeeds with the local SQLite + rules-only baseline unless you provide
optional storage/provider flags. To configure stronger memory at install time,
pass Postgres, embedding, and LLM extraction flags:

```bash
goodmemory install codex \
  --user-id <user-id> \
  --storage-provider postgres \
  --storage-url "postgres://user:pass@host:5432/goodmemory" \
  --embedding-provider openai \
  --embedding-model text-embedding-3-small \
  --embedding-api-key <key> \
  --llm-provider openai \
  --llm-model gpt-4o-mini \
  --llm-api-key <key>
```

If you skip those flags, the install output points to the managed file to edit
later: `~/.goodmemory/codex.json` or `~/.goodmemory/claude.json`. Re-running
`goodmemory install <host>` with the provider flags updates the same managed
config and keeps MCP/hook registration idempotent. The installed hook, MCP, and
`--host` write commands read this managed config directly; shell environment
variables are still supported by the lower-level core runtime, but they are not
required for the installed-host path.

Package upgrade and GoodMemory host uninstall are separate operations. Upgrade
the package through the same package manager you used to install it:

```bash
npm install goodmemory@latest
bun add goodmemory@latest
npm install ./goodmemory-<version>.tgz
```

Package upgrade replaces the package/bin files; it does not delete
`~/.goodmemory`, repo-local `.goodmemory`, local SQLite memory files, or remote
Postgres data. Package uninstall follows the same rule:

```bash
npm uninstall goodmemory
bun remove goodmemory
```

To remove managed host wiring, use GoodMemory's own reversible uninstall:

```bash
goodmemory uninstall codex
goodmemory uninstall claude
```

This removes GoodMemory-managed host config, hooks, and MCP registration for the
target host. It does not delete memory data. Clearing memory is an explicit data
operation (`goodmemory forget ...`) or a manual storage deletion after backup.

```bash
./node_modules/.bin/goodmemory inspect --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory trace --user-id <user-id> --workspace-id <workspace-id> --query "Which runbook is the source of truth?"
./node_modules/.bin/goodmemory export-memory --user-id <user-id> --workspace-id <workspace-id> --output ./tmp/export
./node_modules/.bin/goodmemory stats --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory remember --user-id <user-id> --workspace-id <workspace-id> --session-id <session-id> --message "Remember that the deploy is blocked on smoke verification."
./node_modules/.bin/goodmemory feedback --host codex --workspace-root . --session-id <session-id> --signal "Keep coding summaries short and list explicit next steps."
./node_modules/.bin/goodmemory forget --host codex --workspace-root . --session-id <session-id> --memory-id <memory-id>
./node_modules/.bin/goodmemory -V
./node_modules/.bin/goodmemory install codex --user-id <user-id>
./node_modules/.bin/goodmemory enable codex --workspace-root .
printf '%s' '{"cwd":".","session_id":"s-1","hook_event_name":"SessionStart","source":"startup"}' | ./node_modules/.bin/goodmemory codex hook session-start
./node_modules/.bin/goodmemory mcp serve --host codex
./node_modules/.bin/goodmemory-mcp --host codex
./node_modules/.bin/goodmemory codex bootstrap --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory claude bootstrap --user-id <user-id> --workspace-id <workspace-id>

./node_modules/.bin/goodmemory eval inspect --run-dir reports/eval/live/<run-id> --case-id <case-id>
./node_modules/.bin/goodmemory eval trace --run-dir reports/eval/live/<run-id> --case-id <case-id>
./node_modules/.bin/goodmemory eval export-case --run-dir reports/eval/live/<run-id> --case-id <case-id> --output /tmp/case.json
```

CLI surface:

- `goodmemory -V`
- `goodmemory --version`
- `goodmemory inspect`
- `goodmemory trace`
- `goodmemory export-memory`
- `goodmemory stats`
- `goodmemory remember`
- `goodmemory feedback`
- `goodmemory forget`
- `goodmemory install`
- `goodmemory uninstall`
- `goodmemory enable`
- `goodmemory disable`
- `goodmemory mcp serve`
- `goodmemory-mcp`
- `goodmemory codex hook`
- `goodmemory claude hook`
- `goodmemory codex bootstrap`
- `goodmemory claude bootstrap`
- `goodmemory eval inspect`
- `goodmemory eval trace`
- `goodmemory eval export-case`

The public CLI contract is the package bin `goodmemory`. In a local Bun
consumer, invoke it as `./node_modules/.bin/goodmemory ...`. This repo also
keeps a repo-local script alias for development, but that alias is not part of
the installed-package contract.

## Examples

Installed-package quickstart and integration guidance:

- Node + Bun install and library quickstart: this `README`
- Reference integration guide: [docs/GoodMemory-Reference-Integration-Guide.md](./docs/GoodMemory-Reference-Integration-Guide.md)
- Codex handoff setup guide: [docs/GoodMemory-Codex-Handoff-Setup-Guide.md](./docs/GoodMemory-Codex-Handoff-Setup-Guide.md)
- Claude Code setup guide: [docs/GoodMemory-Claude-Code-Setup-Guide.md](./docs/GoodMemory-Claude-Code-Setup-Guide.md)

Repo-local developer examples:

- Basic chat integration: [examples/basic-chat.ts](./examples/basic-chat.ts)
- Coding-agent flavored integration: [examples/coding-agent.ts](./examples/coding-agent.ts)
- Plain AI SDK server integration: [examples/plain-ai-sdk-server.ts](./examples/plain-ai-sdk-server.ts)
- AI SDK wrapper integration: [examples/vercel-ai-chat.ts](./examples/vercel-ai-chat.ts)
- Life-coach public remember profile: [examples/life-coach-remember-profile.ts](./examples/life-coach-remember-profile.ts)
- Claude-style host artifact consumption: [examples/host-claude-artifacts.ts](./examples/host-claude-artifacts.ts)
- Codex-style session handoff consumption: [examples/host-codex-handoff.ts](./examples/host-codex-handoff.ts)

运行方式：

```bash
bun run example:chat
bun run example:coding-agent
bun run example:ai-sdk-server
bun run example:vercel-ai
bun run example:life-coach-profile
bun run example:host-claude
bun run example:host-codex
```

## Host Adapters

GoodMemory also exposes a dedicated host adapter surface:

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
  scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
  includeRuntime: true,
});
```

Mode guidance:

- `file-assisted`: read compiled artifacts such as `MEMORY.md`, `user.md`, `session-memory/<sessionId>.md`, and `playbooks/*.md` without writing back into canonical state.
- `file-authoritative`: available for the minimal writable subset. Today that subset is the canonical `playbooks/*.md` file only, and it writes back structured deltas into active `validated_pattern` feedback records.

Writable guardrails:

- prompt and skill snippet files (`*.prompt.md`, `*.skill.md`) remain derived read-only outputs
- risky `Guidance` rule edits require an explicit `verifyWrite` approval before they are applied
- low-risk metadata edits such as `appliesTo` and `Why` can write back without the extra verification step
- failed writable operations return diagnostics with rollback guidance; the safe fallback is to recreate the adapter in `file-assisted` mode and inspect the compiled artifacts first

Current host adapter examples stay in `file-assisted` mode because they are the recommended default path for Claude/Codex-style integration.

Reference docs:

- [docs/GoodMemory-Reference-Integration-Guide.md](./docs/GoodMemory-Reference-Integration-Guide.md)
- [docs/GoodMemory-Codex-Handoff-Setup-Guide.md](./docs/GoodMemory-Codex-Handoff-Setup-Guide.md)
- [docs/GoodMemory-Claude-Code-Setup-Guide.md](./docs/GoodMemory-Claude-Code-Setup-Guide.md)

## AI SDK Adapter

GoodMemory's canonical Node-first AI SDK integration is a plain `Request -> Response` server handler built from `createGoodMemory()` plus `createGoodMemoryAISDK()`:

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
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
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

Notes:

- the canonical repo-local server example is [examples/plain-ai-sdk-server.ts](./examples/plain-ai-sdk-server.ts)
- `examples/vercel-ai-chat.ts` remains as the lower-level wrapper/API example
- Next.js App Router can map `export async function POST(request: Request)` straight to the same handler body
- validate `scope.userId` plus `messages[]` at the HTTP boundary before forwarding into `aiSDK.streamText`
- the first cut is still `ModelMessage`-first on the server integration path
- the wrapper augments `system` via `recall()` + `buildContext()` and soft-fails if the memory layer errors
- tool semantics are intentionally deferred in this public v1 slice; only text-bearing user/assistant turns are remembered

## Current Status

GoodMemory 的稳定 OSS 入口是内存 API、Node-compatible 编译型包边界、Bun-backed 已安装 CLI，以及默认推荐的 `file-assisted` host adapter 路径。当前哪些能力已经稳定、哪些仍是内部 rollout 机制、以及现行证据该看哪里，统一收敛在 [docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md)。

默认运行时现在遵循 local-first 自动解析：

- 显式 `storage.provider` 优先
- 没有显式 provider 时，只在可用 Postgres 目标存在时优先走 Postgres
- 在 Bun 上默认落到本地 `./.goodmemory/memory.sqlite`
- 在不具备内建本地 sqlite adapter 的 Node 运行时上，零配置默认回落到 in-memory
- 只有在 `GOODMEMORY_EMBEDDING_*` 完整配置时才自动开启 embeddings；否则保持 `rules-only`
- 在支持的本地运行时上，sqlite 语义检索现在会自动升级到真实 `sqlite-vss` indexed backend；如果运行时不支持，则明确保持 durable fallback，不会假装已经加速
- `0.1.1` 当前的包边界合同是 `goodmemory` / `goodmemory/ai-sdk` / `goodmemory/host` 走编译型 `dist/` 导出；CLI 仍然是 Bun-backed 的运行时附加面

历史 phase closure 文档已经从顶层 docs 下沉到 [docs/archive/quality-gates/README.md](./docs/archive/quality-gates/README.md)。`README` 不再承担按 phase 讲述构建历史的职责；如果你要看执行顺序、闭环状态或 reopen 规则，入口是 [task-board/00-README.txt](./task-board/00-README.txt)。

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

评测链路支持：

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
bun run eval:live-memory
bun run eval:live-auto-memory
bun run eval:live-provider-memory
bun run eval:summary
```

含义：

- `eval:smoke`: 最小 harness 自检，不代表产品评测结果
- `eval:fallback`: deterministic pipeline 验证，不调用真实模型，不可作为产品证据
- `eval:live`: 真实模型生成 + 真实模型 judge 的产品评测入口，使用 in-memory memory backend
- `eval:live-memory`: 真实模型生成 + 真实模型 judge 的 auto-storage 记忆评测入口；没有 `GOODMEMORY_STORAGE_PROVIDER` / `GOODMEMORY_STORAGE_URL` 时走本地 SQLite，配置 Postgres storage URL 时才走 provider-backed
- `eval:live-auto-memory`: `eval:live-memory` 的显式别名，适合需要强调 auto-storage 语义的脚本
- `eval:live-provider-memory`: provider-backed 产品评测入口，强制验证 Postgres + embedding + assisted extraction 的真实记忆链路；不会静默 fallback 到 SQLite
- `eval:summary`: 汇总已有 eval 运行目录，便于审阅当前证据

`eval:live` 必须显式配置以下环境变量，否则会直接失败：

- `GOODMEMORY_EVAL_PROVIDER`
- `GOODMEMORY_EVAL_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_EVAL_MODEL`
- `GOODMEMORY_EVAL_API_KEY`
- `GOODMEMORY_EVAL_MAX_CONCURRENCY` optional live eval parallelism cap
- `GOODMEMORY_JUDGE_PROVIDER`
- `GOODMEMORY_JUDGE_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_JUDGE_MODEL`
- `GOODMEMORY_JUDGE_API_KEY`

`eval:live-memory` / `eval:live-auto-memory` 需要以上全部变量，另外还需要 embedding 和 assisted extractor 配置。它们不读取 `GOODMEMORY_TEST_POSTGRES_URL`；storage 按正常 runtime 规则解析，默认本地 SQLite：

- `GOODMEMORY_EMBEDDING_PROVIDER`
- `GOODMEMORY_EMBEDDING_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_EMBEDDING_MODEL`
- `GOODMEMORY_EMBEDDING_API_KEY`
- `GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER`
- `GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_ASSISTED_EXTRACTOR_MODEL`
- `GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY`

`eval:live-provider-memory` 需要 `eval:live-memory` 的全部变量，另外还需要：

- `GOODMEMORY_TEST_POSTGRES_URL`

产物目录：

- live runs: `reports/eval/live/run-*`
- auto-storage live memory runs: `reports/eval/live-memory/run-*`
- provider-backed live memory runs: `reports/eval/live-provider-memory/run-*`
- fallback runs: `reports/eval/fallback/run-*`

历史 phase 专用 gate / eval 命令仍然存在，但它们已经被收口到 task board 和 quality-gate archive，而不再作为 `README` 的主入口。

## Strategy Rollout

GoodMemory v1 keeps `rules-only` as the supported baseline. New retrieval behavior should move through `observe -> assist -> promote`, and non-default promotion should only happen after an `accepted/passed` promotion gate with no blocking regressions plus a trusted internal promotion authorization artifact.

Operator guidance:

- `observe`: collect isolated shadow evidence without changing the executed path
- `assist`: allow candidate execution in controlled eval runs
- `promote`: require `strategy-promotion-gate.json`, a clean `regression-dashboard.json`, and `strategy-promotion-authorization.json`
- stay `rules-only` when eval evidence is incomplete, provider-backed dependencies are unavailable, or rollback conditions are present

## Key Docs

- Current status and evidence: [docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md)
- Canonical design: [docs/GoodMemory-First-Principles-and-Reference-Architecture.md](./docs/GoodMemory-First-Principles-and-Reference-Architecture.md)
- v1 implementation architecture: [docs/GoodMemory-OSS-Architecture-v1.md](./docs/GoodMemory-OSS-Architecture-v1.md)
- PRD: [docs/GoodMemory-PRD.md](./docs/GoodMemory-PRD.md)
- TDD and evaluation strategy: [docs/GoodMemory-TDD-and-Evaluation-Strategy.md](./docs/GoodMemory-TDD-and-Evaluation-Strategy.md)
- Strategy rollout guide: [docs/GoodMemory-Strategy-Rollout-Guide.md](./docs/GoodMemory-Strategy-Rollout-Guide.md)
- Release checklist: [docs/GoodMemory-v1-Release-Checklist.md](./docs/GoodMemory-v1-Release-Checklist.md)
- Historical quality-gate archive: [docs/archive/quality-gates/README.md](./docs/archive/quality-gates/README.md)
- Historical v1 quality-gate snapshot: [docs/GoodMemory-v1-Quality-Gate.md](./docs/GoodMemory-v1-Quality-Gate.md)

## Current Scope

当前实现重点覆盖：

- semantic / episodic / procedural / runtime memory taxonomy
- inspectable recall and eval artifacts
- product evaluation pipeline
- AI SDK based live eval path

尚未在 v1 完成的内容仍以 task board 为准，入口见 [task-board/00-README.txt](./task-board/00-README.txt)。
