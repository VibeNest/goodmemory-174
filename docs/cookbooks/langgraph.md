# Cookbook: LangGraph (TypeScript)

Give a LangGraph agent durable cross-thread memory backed by GoodMemory,
through the `BaseStore` surface LangGraph already understands.

```bash
npm install goodmemory @langchain/langgraph
```

```ts
import type { BaseStore } from "@langchain/langgraph-checkpoint";
import { createGoodMemory, createGoodMemoryLangGraphStore } from "goodmemory";

const memory = createGoodMemory({});
const store = createGoodMemoryLangGraphStore({
  memory,
  scope: { userId: "u-1", workspaceId: "workspace-a" },
});

// LangGraph types `store` against its abstract class; the adapter mirrors the
// full runtime surface (batch/get/put/delete/search/listNamespaces), so cast:
const graph = builder.compile({ store: store as unknown as BaseStore });
```

Inside a node, read and write memories exactly like any LangGraph store:

```ts
async function callModel(state, config) {
  const userId = config.configurable.userId;
  const memories = await store.search(["memories", userId], {
    query: state.messages.at(-1)?.content,
  });
  const context = memories.map((item) => item.value.content).join("\n");

  // ... call your model with `context` ...

  await store.put(["memories", userId], crypto.randomUUID(), {
    content: "User prefers concise bullet-point summaries.",
  });
}
```

Notes:

- Items live under the GoodMemory `scope` you configured; LangGraph namespaces
  are logical labels, so the same GoodMemory database can also serve hooks,
  MCP, and the HTTP bridge.
- `put` values keep their exact JSON round-trippable via `get`; the `content`
  (or `text` / `memory`) field is what GoodMemory recall searches over — put
  the memory-worthy sentence there.
- `search(..., { query })` rides GoodMemory recall (relevance-ordered);
  without `query` it lists items under the namespace prefix.
- Writes go through the governed remember pipeline (dedupe, evidence records,
  audit via `exportMemory`).
