# GoodMemory Product Comparison

This page positions GoodMemory against adjacent memory products and framework
memory surfaces. It is a product-selection guide, not a benchmark leaderboard.

GoodMemory's own design center is stable: it is a local-first, auditable
carry-forward decision layer for AI products and installed coding agents. It is
not an agent framework, vector database, managed graph service, or generic RAG
system. See
[First Principles](./GoodMemory-First-Principles-and-Reference-Architecture.md)
and [Current Status](./GoodMemory-Current-Status-and-Evidence.md) for the
canonical internal boundary.

External positioning referenced here:

- [Mem0](https://github.com/mem0ai/mem0): universal memory layer for AI agents
  and apps, with a strong drop-in personalization story and multi-signal
  retrieval.
- [Zep](https://help.getzep.com/concepts): managed agent memory centered on a
  temporal Context Graph, facts/entities/episodes, and assembled Context Blocks.
- [LangGraph long-term memory](https://docs.langchain.com/oss/python/langchain/long-term-memory):
  framework-native JSON memories stored under namespaces and keys, with store
  search support.

## Short Answer

Choose GoodMemory when you need local-first memory that can be inspected,
explained, governed, and removed by the application or installed agent host.

Choose Mem0 when you want the fastest path to drop-in personalization memory
and are comfortable adopting its memory algorithm and hosted/open-source
ecosystem.

Choose Zep when you want managed, graph-native, temporal memory infrastructure
with entity/relationship modeling as the product center.

Choose LangGraph memory when your agent already lives inside LangGraph and you
mainly need a framework store for long-term state.

## Comparison Matrix

| Axis | GoodMemory | Mem0 | Zep | LangGraph memory |
|---|---|---|---|---|
| Primary job | Decide what user/project context should carry forward, then make that decision auditable | Add persistent personalization memory to agents/apps with low integration friction | Build and retrieve from temporal graph memory for agents | Provide long-term memory storage inside LangGraph agents |
| Best first user | Product engineer or coding-agent host author who cares about local control and evidence | App or agent developer who wants memory quickly | Enterprise agent team that wants managed graph memory | LangGraph application developer |
| Runtime gravity | Framework-neutral TypeScript package, installed-host hooks, MCP, HTTP bridge | Memory service/library ecosystem | Managed service plus graph-oriented SDKs | LangGraph runtime and store APIs |
| Default posture | Conservative write, precise recall, explicit provider-backed retrieval | Drop-in memory extraction and retrieval | Graph construction, invalidation, context assembly | Namespace/key JSON documents plus search |
| Local-first fit | Strong: Bun SQLite default, explicit Postgres/provider opt-ins, installed host support | Depends on chosen deployment mode | Weaker if the desired path is Zep Cloud; Graphiti can be self-hosted separately | Strong for app-local development; production store is framework-managed |
| Audit and control | Core product surface: inspect, trace, writeback boundaries, forget/export/delete, claim gates | Product-dependent; optimized for easy memory behavior | Strong graph provenance concepts, especially temporal invalidation | Store-level visibility; higher-level memory policy is application code |
| Benchmark posture | Public claims are gate-verified and disclosure-heavy; strict lower-bound tracks are separated from comparable judge tracks | Public benchmark marketing is product-led | Public research emphasizes temporal graph architecture and enterprise evals | Usually not positioned as a standalone benchmarked memory product |
| Where it should not compete | Managed graph memory as the default operational model | Fastest possible hosted personalization onboarding | Enterprise temporal graph platform depth | Being the framework runtime itself |

## Product Positioning

GoodMemory should be described as:

> A local-first memory layer for AI products and coding agents that makes memory
> decisions inspectable, controllable, and benchmark-auditable.

Do not describe GoodMemory as:

- a managed memory cloud
- a Zep-style temporal graph platform
- a Mem0 clone
- a LangGraph replacement
- a vector database
- a generic RAG framework

The strongest public wedge is trust:

- You can see what was remembered.
- You can see why a memory was recalled.
- You can undo, forget, export, or delete.
- You can keep provider-backed retrieval explicit.
- You can reproduce benchmark claims from committed declarations.
- You can use installed-host memory for Codex and Claude Code without making a
  hosted service the default.

## When To Recommend GoodMemory

Recommend GoodMemory for:

- Coding-agent memory across local work sessions.
- AI products that need explicit user/project memory without adopting a full
  agent framework.
- Teams that want local development to work before selecting Postgres,
  embeddings, or hosted infrastructure.
- Products that need abstention discipline and source-grounded answers more
  than always-helpful world-knowledge completion.
- Integrators who need memory audit, writeback review, and deletion controls.
- Teams that want benchmark claims to be traceable to declarations, commands,
  commits, and datasets.

## When To Recommend Something Else

Recommend Mem0 when the buyer asks for the simplest possible personalization
memory layer and does not care as much about conservative write policy,
installed-host audit loops, or strict public-claim gates.

Recommend Zep when the buyer asks for managed temporal graph memory, entity and
relationship traversal as the central abstraction, graph invalidation, and
enterprise-grade hosted operations.

Recommend LangGraph memory when the buyer is already building entirely inside
LangGraph and mainly wants the framework's store semantics rather than a
separate memory product.

Recommend a vector database or RAG stack when the buyer is retrieving external
documents, not deciding what user/project context should carry forward.

## Product Gaps To Close Next

GoodMemory already has credible benchmark rows and local integration surfaces.
The next product work should make those strengths obvious to an outside
engineer.

1. Build a short memory inspector loop.
   The path should be: install, remember, recall, inspect why it recalled,
   undo/forget, export. This is the clearest differentiator from memory black
   boxes.

2. Ship a coding-agent demo.
   Show Codex or Claude Code using installed-host memory across tasks, including
   selective writeback and rollback. This is the most natural GoodMemory wedge.

3. Publish a reproducible evidence pack.
   Package the public claim declarations, commands, dataset license notes, and
   expected output checks so a third party can rerun or audit the claims.

4. Add optional temporal/entity graph primitives carefully.
   Do not make a graph database the default. Start with local-first fact
   metadata: entity aliases, source turn ids, `valid_from`, `valid_to`,
   `supersedes`, contradiction pairs, and recall explanations.

5. Treat abstention as a feature.
   GoodMemory should not answer from world knowledge just to satisfy benchmark
   prompts when the memory context does not support the answer. Grounded
   abstention is a product trust boundary.

## Messaging Template

Use this short positioning when introducing GoodMemory:

> GoodMemory is a local-first, auditable memory layer for AI products and
> coding agents. It sits between your app or installed agent host and the model:
> deciding what to remember, what to recall, how to render it into context, and
> how to inspect or undo those decisions. It is not trying to be the agent
> framework, vector database, or managed graph platform. It is the trust layer
> for user/project continuity.

