# GoodMemory

Language: English | [简体中文](./README.zh-CN.md)

GoodMemory is a memory layer for AI products and coding agents.

It gives chat apps, copilots, and agent hosts a durable user/project memory loop:
write selected facts, retrieve the right context, inject it into the next turn,
audit what happened, and delete it when it is wrong.

GoodMemory is not an LLM, agent framework, vector database, or generic RAG
system. It is the product memory layer between your app or installed agent host
and the model runtime.

## What You Get

- Durable memory API: `remember`, `recall`, `buildContext`, `feedback`, `forget`,
  `exportMemory`, and `deleteAllMemory`.
- Installed agent memory for Codex and Claude Code through `goodmemory setup`,
  managed hooks, `goodmemory status`, read-only MCP, and opt-in writeback.
- Public write customization with `GoodMemoryConfig.remember`,
  `RememberProfile`, `rememberRules`, `RememberInput.annotations`, and named
  extractor ids.
- Package exports for `goodmemory`, `goodmemory/ai-sdk`, and
  `goodmemory/host` through compiled `dist` artifacts and TypeScript
  declarations.
- Local-first storage: Bun gets durable SQLite by default; explicit Postgres,
  injected adapters, and embedding providers can be added when needed.
- Evaluation and release evidence paths for deterministic tests, live evals,
  provider-backed evals, package smoke tests, and quality gates.

## Install

GoodMemory `0.1.2` has two normal install paths.

Use the global CLI when you want memory enhancement inside installed coding
agents:

```bash
npm install -g goodmemory@0.1.2
goodmemory setup
goodmemory status
```

Use the package dependency when you are building an application:

```bash
npm install goodmemory@0.1.2
```

Bun consumers can install it directly:

```bash
bun add goodmemory@0.1.2
```

Tarball verification for release rehearsal:

```bash
npm install ./goodmemory-0.1.2.tgz
```

The installed CLI is Bun-backed for non-version commands. The package bin is
Node-safe for `goodmemory -V` and `goodmemory --version`; other commands
delegate to Bun.

## Quickstart: Codex Or Claude Code Memory

For most users, the first useful path is installed-host memory.

```bash
npm install -g goodmemory@0.1.2
goodmemory setup
goodmemory status
```

`goodmemory setup` detects Codex and Claude Code, installs managed host wiring,
and asks for:

- host: `codex`, `claude`, or both detected hosts
- activation: global, current workspace, or manual opt-in
- GoodMemory user id
- optional Postgres storage
- optional embedding provider
- optional LLM extraction provider
- writeback mode: `off`, `observe`, or `selective`

Interactive setup defaults to global activation with workspace-derived
isolation. Scripted installs stay safe with `--json` or `--no-interactive`.
Skipping provider setup is valid: GoodMemory still works with local SQLite and
rules-only extraction.

Useful commands:

```bash
goodmemory setup --host codex
goodmemory status codex --workspace-root .
goodmemory enable codex --workspace-root . --writeback observe
goodmemory enable codex --workspace-root . --writeback selective
goodmemory disable codex --workspace-root .
goodmemory uninstall codex
```

The installed host path has three pieces:

- Recall injection: `session-start` and `user-prompt-submit` hooks call
  `recall()` plus `buildContext()` and fail open if config, parsing, or storage
  is unavailable.
- Deep inspection: `goodmemory mcp serve --host codex` and `goodmemory-mcp
  --host codex` expose read-only context, trace, stats, and artifact tools.
- Optional writeback: `session-stop` and explicit writeback commands can turn
  selected after-response signals into durable memory.

## Installed Host Writeback

Installed Host Writeback is opt-in. It is off by default.

Use `observe` before `selective`:

```bash
goodmemory enable codex --writeback observe
goodmemory codex writeback --json

goodmemory enable codex --writeback selective
goodmemory codex writeback --json
```

Writeback rules:

- `off`: no after-response memory extraction.
- `observe`: produce candidates and trace without durable writes.
- `selective`: write selected candidates through the public `remember` surface.
- Raw transcripts are not persisted as memory.
- Assistant-originated durable memory is blocked unless the host confirms or
  verifies it and the active profile allows it.
- `remember: "never"` masks annotated content before deterministic, custom, or
  assisted extraction.

Audit and undo:

```bash
goodmemory codex writeback inspect --json
goodmemory codex writeback forget --event-id <event-id> --review-outcome false_write
```

The audit ledger stores bounded redacted candidate previews, candidate keys,
typed linked record ids, status, reasons, host, mode, timestamps,
scope/session digests, and optional manual review metadata. It does not store
raw host payloads. `forget --event-id` deletes linked memory/evidence records
through public `forget()` before marking the audit event forgotten.

Claude Code has deterministic CLI parity for hook and writeback commands;
Codex is the canonical live-evidence path.

## Scripted Host Install

Use `goodmemory install <host>` when you want a fully non-interactive setup:

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

Managed config lives under `~/.goodmemory/<host>.json`. Re-running install with
provider flags updates the same config and keeps MCP/hook registration
idempotent. Package uninstall does not delete `~/.goodmemory`, repo-local
`.goodmemory`, local SQLite files, or remote Postgres data. Use
`goodmemory uninstall <host>` to remove managed host wiring, and use
`goodmemory forget ...` or explicit storage deletion to remove memory data.

## App Quickstart

Use the root package when you are building a chatbox, copilot, or product agent.

```ts
import { createGoodMemory } from "goodmemory";

const memory = createGoodMemory({});

await memory.remember({
  scope: {
    userId: "u-1",
    workspaceId: "workspace-a",
    sessionId: "s-1",
  },
  messages: [
    {
      role: "user",
      content: "Remember that the migration rollout is blocked on QA signoff.",
    },
  ],
});

const recall = await memory.recall({
  scope: {
    userId: "u-1",
    workspaceId: "workspace-a",
    sessionId: "s-2",
  },
  query: "What context should the assistant know before answering?",
  retrievalProfile: "general_chat",
});

const context = await memory.buildContext({
  recall,
  output: "markdown",
});

console.log(context.content);
```

The core loop is intentionally small:

- `remember()` writes selected user, app, or host signals.
- `recall()` retrieves scoped memory for a query.
- `buildContext()` turns recall hits into a prompt fragment or JSON payload.
- `feedback()` records explicit corrections and procedural preferences.
- `forget()` deletes wrong or obsolete memory.

## Runtime And Storage

`createGoodMemory({})` follows a local-first auto-storage contract:

- Explicit `storage.provider` wins when supplied.
- Without explicit storage, GoodMemory uses Postgres only when a configured
  target can bootstrap the GoodMemory backend.
- On Bun, zero-config durable storage is local SQLite at
  `./.goodmemory/memory.sqlite`.
- On Node runtimes without the built-in local SQLite adapter, zero-config
  storage falls back to in-memory.
- Unsupported explicit built-in `sqlite` or `postgres` selections are reported
  as unavailable rather than mislabeled durable.
- Injected `documentStore`, `sessionStore`, or `vectorStore` adapters are
  reported as adapter-defined storage.
- Without `GOODMEMORY_EMBEDDING_*`, runtime behavior remains `rules-only`.
- Supported local runtimes can use `sqlite-vss` for SQLite semantic indexing;
  unsupported runtimes keep durable non-accelerated fallback behavior.

Inspect the resolved runtime instead of guessing:

```ts
import { createGoodMemory, inspectGoodMemoryRuntime } from "goodmemory";

const memory = createGoodMemory({});
const runtime = inspectGoodMemoryRuntime(memory);

console.log(runtime.storage);
```

SQLite vector controls:

- `GOODMEMORY_SQLITE_VECTOR_MODE=off|prefer|require`
- `GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH`
- `GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH`
- `GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT`
- `GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION`

## Public Remember Customization

Product integrations should customize writes through the public `remember`
surface. Do not use test-only extractor seams for product behavior.

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

Profile `extractors` can be raw `MemoryExtractor` objects or named
`{ id, extractor }` entries. Use named extractors for real integrations so
remember events and eval reports carry stable `extractorIds` even if profile
composition changes. Remember events also carry resolved `profileId` and
`presetId` metadata.

## AI SDK Adapter

GoodMemory's Node-compatible AI SDK path is a plain `Request -> Response`
server handler built from `createGoodMemory()` and `createGoodMemoryAISDK()`.

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

Notes:

- The canonical server example is
  [examples/plain-ai-sdk-server.ts](./examples/plain-ai-sdk-server.ts).
- Thin Express and Fastify examples are
  [examples/express-chat-server.ts](./examples/express-chat-server.ts) and
  [examples/fastify-chat-server.ts](./examples/fastify-chat-server.ts).
- `examples/vercel-ai-chat.ts` remains a lower-level wrapper/API example.
- Next.js App Router can map `export async function POST(request: Request)`
  to the same handler body.
- The first public server path is `ModelMessage`-first.
- The wrapper augments `system` through `recall()` and `buildContext()` and
  soft-fails if the memory layer errors.

## Host Adapter API

Use `goodmemory/host` when an external host wants artifacts or host-specific
contracts without importing internals.

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

Modes:

- `file-assisted`: read compiled artifacts such as `MEMORY.md`, `user.md`,
  `session-memory/<sessionId>.md`, and `playbooks/*.md` without treating files
  as canonical storage.
- `file-authoritative`: available for the minimal writable subset. Today that
  subset is the canonical `playbooks/*.md` file shape, writing structured
  deltas back into active validated-pattern feedback records.

Writable guardrails:

- Prompt and skill snippet files remain derived read-only outputs.
- Risky guidance edits require explicit `verifyWrite` approval.
- Low-risk metadata edits such as `appliesTo` and `Why` can write back without
  the extra approval step.
- Failed writable operations return diagnostics with rollback guidance.

Current Claude/Codex examples stay in `file-assisted` mode by default.

## CLI Reference

The public installed-package CLI contract is the package bin `goodmemory`.
In a local dependency install, invoke it as `./node_modules/.bin/goodmemory`.
The repo-local `bun run goodmemory` script is for development only.

Memory-first commands:

```bash
./node_modules/.bin/goodmemory inspect --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory trace --user-id <user-id> --workspace-id <workspace-id> --query "Which runbook is the source of truth?"
./node_modules/.bin/goodmemory export-memory --user-id <user-id> --workspace-id <workspace-id> --output ./tmp/export
./node_modules/.bin/goodmemory stats --user-id <user-id> --workspace-id <workspace-id>
./node_modules/.bin/goodmemory remember --user-id <user-id> --workspace-id <workspace-id> --session-id <session-id> --message "Remember that the deploy is blocked on smoke verification."
./node_modules/.bin/goodmemory feedback --host codex --workspace-root . --session-id <session-id> --signal "Keep coding summaries short and list explicit next steps."
./node_modules/.bin/goodmemory forget --host codex --workspace-root . --session-id <session-id> --memory-id <memory-id>
```

Installed-host commands:

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

Hook and writeback examples:

```bash
printf '%s' '{"cwd":".","session_id":"s-1","hook_event_name":"SessionStart","source":"startup"}' \
  | ./node_modules/.bin/goodmemory codex hook session-start

printf '%s' '{"cwd":".","session_id":"s-1","messages":[{"role":"user","content":"Next step is to finish the release smoke."}]}' \
  | ./node_modules/.bin/goodmemory codex writeback --json

printf '%s' '{"cwd":".","session_id":"s-1","event_id":"stop-1","summary":"Keep coding summaries short."}' \
  | ./node_modules/.bin/goodmemory codex hook session-stop
```

Eval artifact inspection:

```bash
./node_modules/.bin/goodmemory eval inspect --run-dir reports/eval/live/<run-id> --case-id <case-id>
./node_modules/.bin/goodmemory eval trace --run-dir reports/eval/live/<run-id> --case-id <case-id>
./node_modules/.bin/goodmemory eval export-case --run-dir reports/eval/live/<run-id> --case-id <case-id> --output /tmp/case.json
```

CLI surface:

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

## Examples

Installed-package guides:

- Reference integration guide:
  [docs/GoodMemory-Reference-Integration-Guide.md](./docs/GoodMemory-Reference-Integration-Guide.md)
- Codex handoff setup guide:
  [docs/GoodMemory-Codex-Handoff-Setup-Guide.md](./docs/GoodMemory-Codex-Handoff-Setup-Guide.md)
- Claude Code setup guide:
  [docs/GoodMemory-Claude-Code-Setup-Guide.md](./docs/GoodMemory-Claude-Code-Setup-Guide.md)

Repo-local examples:

- Basic chat integration: [examples/basic-chat.ts](./examples/basic-chat.ts)
- Coding-agent flavored integration:
  [examples/coding-agent.ts](./examples/coding-agent.ts)
- Plain AI SDK server integration:
  [examples/plain-ai-sdk-server.ts](./examples/plain-ai-sdk-server.ts)
- Express chat server integration:
  [examples/express-chat-server.ts](./examples/express-chat-server.ts)
- Fastify chat server integration:
  [examples/fastify-chat-server.ts](./examples/fastify-chat-server.ts)
- AI SDK wrapper integration:
  [examples/vercel-ai-chat.ts](./examples/vercel-ai-chat.ts)
- Life-coach public remember profile:
  [examples/life-coach-remember-profile.ts](./examples/life-coach-remember-profile.ts)
- Claude-style host artifact consumption:
  [examples/host-claude-artifacts.ts](./examples/host-claude-artifacts.ts)
- Codex-style session handoff consumption:
  [examples/host-codex-handoff.ts](./examples/host-codex-handoff.ts)

Run examples from this repo:

```bash
bun run example:chat
bun run example:coding-agent
bun run example:ai-sdk-server
bun run example:express-chat
bun run example:fastify-chat
bun run example:vercel-ai
bun run example:life-coach-profile
bun run example:host-claude
bun run example:host-codex
```

## Testing And Eval

Default local gates:

```bash
bun test
bun run typecheck
bun run test:coverage
```

Use `bun run test:all` only when you intentionally want the broader sweep
through vendored or third-party test trees.

Eval commands:

```bash
bun run eval:smoke
bun run eval:fallback
bun run eval:live
bun run eval:live-memory
bun run eval:live-auto-memory
bun run eval:live-provider-memory
bun run eval:summary
```

Meanings:

- `eval:smoke`: harness self-check.
- `eval:fallback`: deterministic validation without live model calls.
- `eval:live`: live generator plus live judge with an in-memory backend.
- `eval:live-memory`: live generator plus live judge using auto-storage
  semantics; default storage is local SQLite unless provider storage resolves.
- `eval:live-auto-memory`: alias for `eval:live-memory` when scripts need to
  make auto-storage explicit.
- `eval:live-provider-memory`: provider-backed evidence path requiring
  Postgres, embeddings, and assisted extraction; it does not silently fall back
  to SQLite.
- `eval:summary`: summarize existing eval output directories.

Live eval environment:

- `GOODMEMORY_EVAL_PROVIDER`
- `GOODMEMORY_EVAL_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_EVAL_MODEL`
- `GOODMEMORY_EVAL_API_KEY`
- `GOODMEMORY_EVAL_MAX_CONCURRENCY` optional parallelism cap
- `GOODMEMORY_JUDGE_PROVIDER`
- `GOODMEMORY_JUDGE_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_JUDGE_MODEL`
- `GOODMEMORY_JUDGE_API_KEY`

`eval:live-memory` and `eval:live-auto-memory` also need embedding and
assisted extractor configuration:

- `GOODMEMORY_EMBEDDING_PROVIDER`
- `GOODMEMORY_EMBEDDING_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_EMBEDDING_MODEL`
- `GOODMEMORY_EMBEDDING_API_KEY`
- `GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER`
- `GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL` for OpenAI-compatible gateways
- `GOODMEMORY_ASSISTED_EXTRACTOR_MODEL`
- `GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY`

`eval:live-provider-memory` additionally requires:

- `GOODMEMORY_TEST_POSTGRES_URL`

Output directories:

- live runs: `reports/eval/live/run-*`
- auto-storage live memory runs: `reports/eval/live-memory/run-*`
- provider-backed live memory runs: `reports/eval/live-provider-memory/run-*`
- fallback runs: `reports/eval/fallback/run-*`

## Strategy Rollout

GoodMemory keeps `rules-only` as the supported baseline. New retrieval behavior
moves through `observe -> assist -> promote`.

Operator guidance:

- `observe`: collect isolated shadow evidence without changing the executed path.
- `assist`: allow candidate execution in controlled eval runs.
- `promote`: require `strategy-promotion-gate.json`, a clean
  `regression-dashboard.json`, and
  `strategy-promotion-authorization.json`.
- Stay `rules-only` when eval evidence is incomplete, provider-backed
  dependencies are unavailable, or rollback conditions are present.

## Current Status

Current stable public surface:

- root memory API through `goodmemory`
- AI SDK adapter through `goodmemory/ai-sdk`
- host adapter and host contracts through `goodmemory/host`
- installed CLI and managed host setup through `goodmemory setup`
- Codex and Claude Code hooks for recall
- read-only MCP for inspection and debugging
- opt-in installed-host writeback with audit and undo
- local SQLite durable fallback on Bun
- Postgres, embeddings, assisted extraction, and provider-backed evals when
  configured

Still outside the accepted public claim:

- default-on automatic writeback
- raw transcript archive
- dashboard or managed cloud
- treating exported artifact files as canonical storage
- broadening root exports with internal proposal or promotion internals

For the detailed current-state and evidence map, use
[docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md).

## Documentation

- Current status and evidence:
  [docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md)
- Canonical design:
  [docs/GoodMemory-First-Principles-and-Reference-Architecture.md](./docs/GoodMemory-First-Principles-and-Reference-Architecture.md)
- v1 implementation architecture:
  [docs/GoodMemory-OSS-Architecture-v1.md](./docs/GoodMemory-OSS-Architecture-v1.md)
- PRD:
  [docs/GoodMemory-PRD.md](./docs/GoodMemory-PRD.md)
- TDD and evaluation strategy:
  [docs/GoodMemory-TDD-and-Evaluation-Strategy.md](./docs/GoodMemory-TDD-and-Evaluation-Strategy.md)
- Strategy rollout guide:
  [docs/GoodMemory-Strategy-Rollout-Guide.md](./docs/GoodMemory-Strategy-Rollout-Guide.md)
- Release checklist:
  [docs/GoodMemory-v1-Release-Checklist.md](./docs/GoodMemory-v1-Release-Checklist.md)
- Historical quality-gate archive:
  [docs/archive/quality-gates/README.md](./docs/archive/quality-gates/README.md)
- Historical v1 snapshot:
  [docs/GoodMemory-v1-Quality-Gate.md](./docs/GoodMemory-v1-Quality-Gate.md)

Use [task-board/00-README.txt](./task-board/00-README.txt) for execution order,
open follow-up work, and phase-specific acceptance boundaries.
