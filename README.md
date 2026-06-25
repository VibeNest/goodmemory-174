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
  managed hooks, installed Codex pre-action, `goodmemory status`, read-only
  MCP, and opt-in writeback.
- Public write customization with `GoodMemoryConfig.remember`,
  `RememberProfile`, `rememberRules`, `RememberInput.annotations`, and named
  extractor ids.
- Package exports for `goodmemory`, `goodmemory/ai-sdk`, `goodmemory/host`,
  and `goodmemory/http` through compiled `dist` artifacts and TypeScript
  declarations.
- Local-first storage: Bun gets durable SQLite by default; explicit Postgres,
  injected adapters, and embedding providers can be added when needed.
- Evaluation and release evidence paths for deterministic tests, live evals,
  provider-backed evals, package smoke tests, and quality gates.

## Benchmark Results

GoodMemory is moving through memory benchmarks one at a time. The compact table
below shows accepted current evidence first, with empty rows left as `-` until
the matching benchmark is completed and backed by a report.

| Benchmark | Primary metric | GoodMemory result | Baseline / reference | Evidence |
|---|---|---:|---:|---|
| ImplicitMemBench Full-300 | overall score | 213.26 / 300 (71.09%) with `goodmemory-distilled-feedback+controlled-priming` | 128 / 300 (42.67%) upstream-chat baseline | [live full-300 summary](./reports/eval/live/phase-61-full300/run-phase61-full300-20260505T170001Z/overall-summary.json) |
| LongMemEval full 500 | answer accuracy plus evidence-session recall | answer accuracy 454 / 500 (90.8%); evidence-session recall 0.9590 with `goodmemory-hybrid` | answer accuracy 451 / 500 (90.2%) latest accepted full-context reference | [accepted report](./reports/eval/research/phase-62/longmemeval/run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z/report.json) |
| BEAM (100K, rules-only retrieval diagnostic) | evidence-chat recall (dual: fitted vs generalization) | **fitted 0.9621** with `goodmemory-rules-only` (all narrow gates on; 100K split, 355 evidence questions of 400; 20 missed-recall, 0 zero-recall) — **generalization 0.6822** with all 151 narrow gates disabled (147 missed). The 28-pt gap is the scenario-fitted contribution, not general retrieval (see [ADR-005](./adr/ADR-005-scenario-fitted-recall-boundary.txt)). | 0.1163 first rules-only diagnostic on the same split | [latest accepted diagnostic](./reports/eval/research/phase-63/beam/run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z/recall-diagnostic.json) |
| MemoryAgentBench | - | - | - | - |
| LoCoMo | - | - | - | - |

These rows are research and hardening evidence, not a final public leaderboard.
The BEAM row reports rules-only retrieval recall (evidence-chat recall over the
100K split). An end-to-end measured full-run checkpoint has now been run internally
(`run-phase63-beam-100k-live-closure-gpt55-evidence-pack-answer-hardening-current`):
278 / 400 answer accuracy (0.695) with rules-only retrieval, a general
answer-time evidence pack (`src/answer/evidencePack.ts`), and a same-model
semantic judge, `executionFailures: 0` — up from 224 / 400 (0.56) before the
evidence pack and 261 / 400 (0.6525) at the prior pack checkpoint, at identical
recall. That is internal measured evidence, not a public benchmark claim — it
rides on the fitted recall below and uses the answer model as its own judge, so
the accepted README row stays retrieval-focused while answer-gap hardening and
cross-benchmark evidence mature.
MemoryAgentBench and LoCoMo rows remain blank until promoted to public claims.
Internally, MemoryAgentBench has AR/CR small-slice zero-failure evidence
(CR 0.959, AR 0.67, `executionFailures: 0`), while LoCoMo has a representative
live-path run (199 questions, 0.020 answer accuracy) and a banked
retrieval-boundary finding: the current lexical/rules substrate is recall-bound
on short conversational dialog (exact gold-turn recall ~0.07-0.08, zero-retrieval
~0.92) and needs real semantic retrieval before any performance claim.
Per [ADR-005](./adr/ADR-005-scenario-fitted-recall-boundary.txt) the BEAM
recall is reported as a dual metric: a `fitted` figure (all narrow gates on)
and a `generalization` figure (all narrow gates disabled). The large gap means
much of the fitted recall comes from scenario-fitted query classifiers tuned to
specific BEAM cases, which do not fire on unrelated user data; readers should
treat the generalization figure as the floor for out-of-distribution inputs. The current external benchmark order is LongMemEval -> BEAM ->
MemoryAgentBench -> LoCoMo. Use
[task-board/00-README.txt](./task-board/00-README.txt) for execution order and
[docs/GoodMemory-Current-Status-and-Evidence.md](./docs/GoodMemory-Current-Status-and-Evidence.md)
for claim boundaries.

## Choose Your Integration Path

GoodMemory has three primary product entry points. They are not the only APIs:
lower-level surfaces such as `goodmemory/host`, custom stores, eval tooling, and
runtime helpers support these paths. They are the README-level ways to decide
how to start.

### 1. Build Memory Into An Agent, Chatbox, Or Copilot

Use this when you own the product server and the model call. Install
`goodmemory` in your Node/Bun service, create one `memory` instance, and pass a
stable `scope` such as `userId`, `workspaceId`, `sessionId`, and optionally
`agentId`.

The request flow is:

1. Before the model call, run `recall()` for the current scope and query.
2. Run `buildContext()` to turn recall hits into a prompt fragment.
3. Call your model with that memory context.
4. After the response, write selected signals with `memory.jobs.enqueueRemember()`
   or `remember()`.
5. Use `feedback()`, targeted `reviseMemory()`, `forget()`, and `exportMemory()`
   for correction, deletion, and user audit.

If your server already uses Vercel AI SDK, use `goodmemory/ai-sdk` to wrap
`generateText()` or `streamText()` instead of hand-wiring the whole loop. Start
with [App Quickstart](#app-quickstart), then read
[AI SDK Adapter](#ai-sdk-adapter) if you use AI SDK.

### 2. Add Memory To Codex Or Claude Code

Use this when you want an installed coding agent to remember project and user
context without changing the agent itself. Install the global CLI and run
`goodmemory setup`.

The installed-host flow is:

1. `session-start` and `user-prompt-submit` hooks recall scoped memory.
2. GoodMemory injects a compact context block into Codex or Claude Code.
3. Codex `pre-tool-use` can deny or redirect risky Bash through
   `goodmemory codex action` on the same installed config and storage path.
4. Read-only MCP gives trace, context, stats, and artifact inspection.
5. Optional writeback stays `off` by default; use `observe` to inspect
   candidates before moving to `selective` durable writes.

Start with [Quickstart: Codex Or Claude Code Memory](#quickstart-codex-or-claude-code-memory).
Use [Installed Host Writeback](#installed-host-writeback) when you are ready to
review or enable writes.

### 3. Deploy GoodMemory As A Backend Memory-Layer Service

Use this when another backend should call GoodMemory as a service, especially
when the product backend is Python/FastAPI or when a product such as OneLife
should keep memory server-side instead of bundling GoodMemory into a mobile or
browser client.

Deploy the packaged `goodmemory-http-bridge` in a Node/Bun sidecar. Your backend
then calls:

- `/memory/recall-context` before its own model call
- `/memory/remember` after a user-confirmed or product-approved signal
- `/memory/feedback` for procedural corrections
- `/memory/export` and `/memory/forget` for audit and deletion
- `/memory/revise` for targeted correction by explicit memory id

Your service still owns auth, product policy, UI, and model orchestration.
GoodMemory owns memory storage, recall, context assembly, write governance, and
audit/export/delete behavior. Start with
[Python/FastAPI HTTP Bridge](#pythonfastapi-http-bridge), then check
[Runtime And Storage](#runtime-and-storage) for SQLite/Postgres choices.

During a model turn, GoodMemory does four jobs:

1. Resolve memory for the current `scope`.
2. Build a prompt-ready context fragment.
3. Record selected post-response signals when your app or host allows it.
4. Provide audit, correction, export, and deletion paths for user control.

Your app or installed agent still owns auth, UI, model calls, and product
policy. GoodMemory owns the memory loop and storage boundary.

## Install

GoodMemory `0.3.5` has two normal install paths.

Use the global CLI when you want memory enhancement inside installed coding
agents:

```bash
npm install -g goodmemory@0.3.5
goodmemory setup
goodmemory status
```

Use the package dependency when you are building an application:

```bash
npm install goodmemory@0.3.5
```

If you want to type `goodmemory` directly, install the global CLI.
A project-local `npm install goodmemory@0.3.5` does not put `goodmemory` on your shell `PATH`.
Use `npx goodmemory`, `npm exec -- goodmemory`, or `./node_modules/.bin/goodmemory`
from that project instead.

```bash
npx goodmemory -V
```

Bun consumers can install it directly:

```bash
bun add goodmemory@0.3.5
```

Tarball verification for release rehearsal:

```bash
npm install ./goodmemory-0.3.5.tgz
```

The installed CLI is Bun-backed for non-version commands. The package bin is
Node-safe for `goodmemory -V` and `goodmemory --version`; other commands
delegate to Bun.

## Quickstart: Codex Or Claude Code Memory

For most users, the first useful path is installed-host memory.

```bash
npm install -g goodmemory@0.3.5
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
isolation and recommends `observe` for new host configs so users can review
writeback candidates before enabling durable writes. Existing host configs keep
their current writeback mode when the interactive prompt default is accepted.
Scripted installs stay safe with `--json` or `--no-interactive`.
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

The installed host path has four pieces:

- Managed pre-action for Codex: `pre-tool-use` can deny or redirect risky Bash
  and `goodmemory codex action` executes the vetted first step on the same
  installed config, storage, provider, and scope path used by recall and
  writeback.
- Recall injection: `session-start` and `user-prompt-submit` hooks call
  `recall()` plus `buildContext()` and fail open if config, parsing, or storage
  is unavailable.
- Deep inspection: `goodmemory mcp serve --host codex` and `goodmemory-mcp
  --host codex` expose read-only context, trace, stats, and artifact tools.
- Optional writeback: `session-stop` and explicit writeback commands can turn
  selected after-response signals into durable memory.

## Installed Host Writeback

Installed Host Writeback is opt-in. Runtime config defaults and new scripted
installs remain `off` unless the user explicitly chooses a writeback mode.
Existing configs keep their current writeback mode when no explicit override is
provided. New interactive installs recommend `observe` so candidates are visible
before durable writes are enabled.

Use `observe` before `selective`:

```bash
goodmemory enable codex --writeback observe
goodmemory codex writeback --json

goodmemory enable codex --writeback selective
goodmemory codex writeback --json
```

Writeback rules:

- `off`: no after-response memory extraction.
- `observe`: store local bounded/redacted candidate previews for review without
  raw transcripts or durable memory writes.
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
through public `forget()` before marking durable audit events forgotten; for
observe-only events it marks the candidate dismissed without calling
`forget()`.

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
The recommended Node service path is the same thin loop used by the Express and
Fastify examples. A longer walkthrough lives in
[docs/GoodMemory-15-Minute-App-Integration.md](./docs/GoodMemory-15-Minute-App-Integration.md).

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

// Call startSession once when the product opens a new session. For later turns
// with the same sessionId, append to the existing runtime state instead.
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

The core memory loop is intentionally small:

- `remember()` writes selected user, app, or host signals.
- `recall()` retrieves scoped memory for a query.
- `buildContext()` turns recall hits into a prompt fragment or JSON payload.
- `feedback()` records explicit corrections and procedural preferences.
- `forget()` deletes wrong or obsolete memory.

For production app integrations, the recommended turn loop adds the governed
runtime layer around that core:

- `memory.runtime.startSession()` and `memory.runtime.appendMessage()` track
  current-session state without making raw transcripts durable memory.
- `memory.jobs.enqueueRemember()` schedules after-response memory writes with
  idempotency and visible job status.
- `memory.jobs.drain()` commits queued writes in this in-memory scheduler. In a
  production service, run draining in your worker or request-adjacent job loop.
- `GoodMemoryConfig.observability.traceSink` receives redaction-safe traces for
  remember, recall, context, revise, forget, export, and job events.
- `memory.reviseMemory({ target: { memoryId } })` corrects a known memory by
  explicit id, not by fuzzy text selection.
- `exportMemory()` gives the user an audit/export path.

Runtime archive persistence is off by default. If you call
`memory.runtime.endSession({ scope, archive: "off" })`, session state is
cleared without writing an archive. If you opt into archive persistence, keep it
summary-only and never treat raw transcripts as the default memory source.

For server integrations, start with the thin examples:
[examples/express-chat-server.ts](./examples/express-chat-server.ts) or
[examples/fastify-chat-server.ts](./examples/fastify-chat-server.ts).
For Python/FastAPI backends, use the packaged `goodmemory-http-bridge` path
described below.

## Opt-In Recall Tuning: Multi-Hop, Offline Embedding, And Conversational Extraction

The knobs below are optional and conservative by design. Default recall is
single-pass and rules-only, and default extraction is unchanged; nothing happens
unless you opt in.

### Opt-in multi-hop recall

`recall()` is single-pass by default. Pass `multiHop: true` for an opt-in
two-pass retrieval: GoodMemory runs the query, extracts bridge entities named in
the first-pass evidence, expands the query with them, and runs a second pass.

```ts
const recall = await memory.recall({
  scope,
  query: "Who manages the project Alice started?",
  multiHop: true,
});
```

Use it when the answer needs an entity that only the first hop names (hop 1 finds
"Alice started Project Atlas"; hop 2 needs "who manages Project Atlas").

- It is opt-in. Default recall stays single-pass; leaving `multiHop` unset
  changes nothing.
- It is **not** a general semantic retriever. It bridges named entities
  lexically; it does not rank by meaning.
- It can **add noise when first-pass recall is weak**: if hop 1 surfaces the
  wrong evidence, the extracted bridge entities are wrong and the expanded query
  dilutes recall. Measured on LoCoMo (where base retrieval is very low) `multiHop`
  *hurt* recall, so do not reach for it to fix conversational / phrasing-gap
  retrieval — that needs real semantic retrieval, not multi-hop bridging.

### Offline local embedding adapter

`createLocalEmbeddingAdapter()` is a deterministic, offline, dependency-free
embedding adapter (hashed character-n-gram vectors). Inject it for
lexical/morphological tie-breaking without configuring an embedding provider:

```ts
import { createGoodMemory, createLocalEmbeddingAdapter } from "goodmemory";

const memory = createGoodMemory({
  adapters: { embeddingAdapter: createLocalEmbeddingAdapter() },
});
```

- It is **not** neural semantic retrieval. The vectors are hashed lexical
  features, so they break ties between lexically similar candidates; they do not
  understand meaning.
- Do **not** use it to claim a semantic benchmark improvement. It cannot bridge a
  question-to-text phrasing gap that surface lexical overlap already misses.
- For real semantic ranking, configure a neural embedding provider via
  `GOODMEMORY_EMBEDDING_*` instead.

### Opt-in conversational fact extraction

By default, assisted extraction (when a `providers.extraction` model is
configured) pulls durable product memory — profiles, preferences, references,
and facts. Set `providers.extraction.mode: "conversational"` to instead
decompose dialogue into self-contained, coreference-resolved, entity- and
date-normalized atomic claims at write time, so later retrieval matches a
normalized fact instead of a raw conversational turn.

```ts
const memory = createGoodMemory({
  providers: {
    extraction: {
      provider: "openai",
      model: "gpt-5.5",
      apiKey: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY!,
      baseURL: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL,
      mode: "conversational",
    },
  },
});
```

Use it for chat/agent products where memory comes from multi-turn conversation
and questions are phrased differently from how things were said ("Who is the
user's manager?" vs. "yeah my boss Dana signed off").

- It is opt-in. Leaving `mode` unset (or omitting `providers.extraction`) keeps
  the default extraction behavior; the recall ranking path is untouched.
- It is a **write-time LLM pass**: it uses your configured chat model, so it adds
  extraction latency and token cost, and like any LLM step it can drop or
  misphrase a claim. Raw turns remain the ground truth.
- It is **not** semantic retrieval. It normalizes the stored text so lexical
  retrieval has a better surface to match; it does not rank by meaning. It is the
  embedding-free lever for the conversational phrasing gap, not a replacement for
  a neural embedding provider.
- Do **not** quote a benchmark number from it without held-out validation, and
  do not tune the extraction prompt to a specific benchmark's phrasing.

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

## Python/FastAPI HTTP Bridge

Use the packaged HTTP bridge when a Python backend should call GoodMemory as a
server-side memory service.

```bash
GOODMEMORY_HTTP_BRIDGE_TOKEN="replace-with-service-token" \
GOODMEMORY_STORAGE_PROVIDER=postgres \
GOODMEMORY_STORAGE_URL="postgres://user:pass@host:5432/goodmemory" \
./node_modules/.bin/goodmemory-http-bridge --profile life-coach
```

Python callers send `Authorization: Bearer <token>` plus the `x-goodmemory-*`
scope headers to `POST /memory/recall-context`, `/memory/remember`,
`/memory/feedback`, `/memory/export`, `/memory/forget`, and targeted
`/memory/revise`. The TypeScript bridge API is available from `goodmemory/http`.

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

The `goodmemory` command on your shell `PATH` is the global CLI installed with
`npm install -g goodmemory@0.3.5`. In a local dependency install, invoke the
package bin as `npx goodmemory`, `npm exec -- goodmemory`, or
`./node_modules/.bin/goodmemory`. The repo-local `bun run goodmemory` script is
for development only.

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
goodmemory -V
goodmemory --version
goodmemory setup --host codex
goodmemory status codex --workspace-root .
goodmemory install codex --activation-mode global --writeback observe --user-id <user-id>
goodmemory enable codex --workspace-root . --writeback selective
goodmemory mcp serve --host codex
goodmemory-mcp --host codex
goodmemory codex bootstrap --user-id <user-id> --workspace-id <workspace-id>
goodmemory claude bootstrap --user-id <user-id> --workspace-id <workspace-id>
```

Hook and writeback examples:

```bash
printf '%s' '{"cwd":".","session_id":"s-1","hook_event_name":"SessionStart","source":"startup"}' \
  | goodmemory codex hook session-start

printf '%s' '{"cwd":".","session_id":"s-1","tool_name":"Bash","tool_input":{"command":"./tools/DeepAnalyzer --detailed"}}' \
  | goodmemory codex hook pre-tool-use

goodmemory codex action -- ./tools/DeepAnalyzer --detailed

printf '%s' '{"cwd":".","session_id":"s-1","messages":[{"role":"user","content":"Next step is to finish the release smoke."}]}' \
  | goodmemory codex writeback --json

printf '%s' '{"cwd":".","session_id":"s-1","event_id":"stop-1","summary":"Keep coding summaries short."}' \
  | goodmemory codex hook session-stop
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

- 15-minute app integration guide:
  [docs/GoodMemory-15-Minute-App-Integration.md](./docs/GoodMemory-15-Minute-App-Integration.md)
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
- HTTP bridge API through `goodmemory/http` and packaged
  `goodmemory-http-bridge`
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

- Documentation map and archive policy:
  [docs/README.md](./docs/README.md)
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
open follow-up work, and phase-specific acceptance boundaries. Archived design
inputs are not current truth and are routed through `docs/README.md`.
