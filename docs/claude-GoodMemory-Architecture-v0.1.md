# GoodMemory — Architecture Document & Development Plan

> **A pluggable, LLM-agnostic memory layer for chatbots and AI agents.**
> `npm install goodmemory`

**Version:** 0.1.0-draft
**Date:** 2026-03-12
**Status:** Architecture Proposal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Market Position](#2-problem-statement--market-position)
3. [Design Principles](#3-design-principles)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [Memory Model — Four Layers](#5-memory-model--four-layers)
6. [Core Subsystems](#6-core-subsystems)
7. [Public API Design](#7-public-api-design)
8. [Storage Abstraction Layer](#8-storage-abstraction-layer)
9. [LLM Abstraction Layer](#9-llm-abstraction-layer)
10. [Embedding Pipeline](#10-embedding-pipeline)
11. [Memory Router — Intelligent Retrieval](#11-memory-router--intelligent-retrieval)
12. [Memory Lifecycle Management](#12-memory-lifecycle-management)
13. [Prompt Assembly Engine](#13-prompt-assembly-engine)
14. [Observability & Debugging](#14-observability--debugging)
15. [Security & Privacy](#15-security--privacy)
16. [Performance Budget](#16-performance-budget)
17. [Package Structure & Monorepo Layout](#17-package-structure--monorepo-layout)
18. [Technology Stack](#18-technology-stack)
19. [Development Roadmap](#19-development-roadmap)
20. [Competitive Analysis](#20-competitive-analysis)
21. [Open-Source Strategy](#21-open-source-strategy)

---

## 1. Executive Summary

**GoodMemory** is an open-source TypeScript library that gives any LLM-powered application persistent, intelligent user memory. It sits between your application and the LLM API, managing what the model "knows" about each user across conversations.

The core insight: memory is not a storage problem — it is an **information retrieval + compression + routing** problem. Storing everything is easy. Knowing *what to retrieve*, *how much to inject*, and *when to forget* is the hard part.

GoodMemory solves this with a four-layer memory architecture, an intelligent retrieval router, and an asynchronous memory extraction pipeline — all behind a minimal API:

```typescript
import { GoodMemory } from 'goodmemory';

const memory = new GoodMemory({
  llm: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  storage: { provider: 'postgres' },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
});

// Before calling your LLM — inject relevant memories
const context = await memory.recall(userId, userMessage);
// context.systemPrompt  → enriched system prompt with user profile + relevant facts
// context.prefixMessages → synthetic message history from episodic memory

// After receiving LLM response — extract new memories
await memory.learn(userId, conversation);
```

---

## 2. Problem Statement & Market Position

### 2.1 The Problem

Every LLM API call is stateless. The model remembers nothing between requests. Products that want continuity must build memory themselves. Current approaches each have critical flaws:

| Approach | Example | Failure Mode |
|----------|---------|--------------|
| Flat-file `.md` memory | Claude Code, Lobster, CLAUDE.md | No semantic retrieval; breaks at scale; context window ceiling |
| Brute-force RAG on everything | Cursor | Noise explosion; irrelevant context injected every call; high cost |
| Zero-RAG skill files | Anthropic Skills | Context window exhaustion as system complexity grows |
| Platform-native memory | ChatGPT Memory, Claude Memory | Vendor lock-in; not programmable; no fine-grained control |

### 2.2 Market Position

GoodMemory occupies a unique position: **infrastructure-layer memory for AI applications**.

- **NOT** an agent framework (not competing with LangChain, CrewAI, AutoGen)
- **NOT** a vector database (not competing with Pinecone, Qdrant, Weaviate)
- **NOT** an LLM provider (not competing with OpenAI, Anthropic)

It is a **composition layer** that orchestrates these components specifically for the user-memory use case. Think of it as the "Auth0 of AI memory" — you don't build auth yourself, you shouldn't build memory yourself either.

### 2.3 Target Users

1. **Indie developers** building chatbot/agent products
2. **SaaS companies** adding AI features that need personalization
3. **Enterprise teams** building internal AI assistants
4. **Agent framework authors** who want to bolt on memory without building it

---

## 3. Design Principles

### P1: Zero Lock-in

Every external dependency (LLM, vector DB, relational DB, embedding model) is behind an adapter interface. Switching from Pinecone to Qdrant, or from OpenAI embeddings to Cohere, is a config change — not a migration.

### P2: Pay for What You Use

Memory operations have real costs (LLM calls for extraction, embedding API calls, storage). GoodMemory must make costs visible and controllable. Every feature that incurs cost must be opt-in or budget-capped.

### P3: Correct by Default, Tunable by Experts

Out of the box, `new GoodMemory(minimalConfig)` should "just work" for 80% of use cases. Power users can override every component: custom routers, custom extractors, custom decay functions, custom prompt templates.

### P4: Async-First, Never Block the User

Memory extraction and consolidation happen asynchronously. The user-facing hot path (`recall`) must be fast. The background path (`learn`, `consolidate`) can take its time.

### P5: Transparency over Magic

Every memory decision (what was recalled, what was ignored, why) must be inspectable. Developers must be able to answer "why did the AI say that?" by tracing back to specific memory records.

---

## 4. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        YOUR APPLICATION                          │
│                                                                  │
│   User Message ──▶ memory.recall(userId, msg) ──▶ Enriched Ctx  │
│                                                   │              │
│                                              LLM API Call        │
│                                                   │              │
│   LLM Response ◀──────────────────────────────────┘              │
│        │                                                         │
│        └──▶ memory.learn(userId, conversation)  [async]          │
└──────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                       GOODMEMORY CORE                            │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   Memory     │  │   Memory     │  │   Prompt Assembly      │  │
│  │   Router     │  │   Extractor  │  │   Engine               │  │
│  │  (retrieval  │  │  (learning   │  │  (serialization +      │  │
│  │   decisions) │  │   pipeline)  │  │   token budgeting)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘  │
│         │                 │                        │              │
│  ┌──────▼─────────────────▼────────────────────────▼───────────┐ │
│  │                  Memory Store (unified interface)            │ │
│  │                                                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │ │
│  │  │ L0:      │  │ L1:      │  │ L2:      │  │ L3:        │  │ │
│  │  │ Buffer   │  │ Profile  │  │ Facts    │  │ Episodes   │  │ │
│  │  │ (in-mem) │  │ (KV)     │  │ (vector) │  │ (vector)   │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────────────┐ │
│  │              Lifecycle Manager                                │ │
│  │  (decay · consolidation · conflict resolution · forgetting)  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              Adapter Layer                                    │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │ │
│  │  │ LLM      │  │ Embedding    │  │ Storage Adapters       │ │ │
│  │  │ Adapters  │  │ Adapters     │  │ (Postgres, SQLite,     │ │ │
│  │  │ (Claude,  │  │ (OpenAI,     │  │  Redis, Pinecone,      │ │ │
│  │  │  OpenAI,  │  │  Cohere,     │  │  Qdrant, Chroma,       │ │ │
│  │  │  local)   │  │  local)      │  │  in-memory)            │ │ │
│  │  └──────────┘  └──────────────┘  └────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Memory Model — Four Layers

### L0: Conversation Buffer

**Purpose:** Maintain multi-turn context within a single session.
**Storage:** In-memory (Map or Redis for distributed).
**Lifetime:** Session-scoped. Destroyed or archived when session ends.

```typescript
interface ConversationBuffer {
  sessionId: string;
  userId: string;
  messages: Message[];          // Full recent messages
  summary: string | null;       // Compressed summary of older messages
  summaryUpToIndex: number;     // Messages[0..N] are summarized
  createdAt: Date;
  lastActiveAt: Date;
}
```

**Key behaviors:**
- Sliding window: keep last N messages raw, compress older ones into summary.
- Summary compression triggered when `messages.length > windowSize` (configurable, default 20).
- Summary itself is generated by an LLM call (background, non-blocking).

### L1: User Profile

**Purpose:** Compressed, structured representation of who the user is.
**Storage:** Key-value (one document per user).
**Lifetime:** Persistent. Updated incrementally.
**Typical size:** 200–500 tokens.

```typescript
interface UserProfile {
  userId: string;
  
  // Core identity
  identity: {
    name?: string;
    role?: string;
    organization?: string;
    location?: string;
    timezone?: string;
    languagePreference?: string;
  };
  
  // Skills & expertise
  expertise: {
    primarySkills: string[];     // ["C#", "DDD", "Elsa Workflow"]
    domains: string[];           // ["industrial robotics", "quantitative trading"]
    level: 'beginner' | 'intermediate' | 'senior' | 'expert';
  };
  
  // Communication preferences
  preferences: {
    responseStyle?: string;      // "detailed", "concise", "code-heavy"
    formality?: 'casual' | 'professional' | 'academic';
    formatting?: string;         // "prefers code examples", "likes diagrams"
  };
  
  // Active goals & projects
  activeContext: {
    goals: string[];
    currentProjects: string[];
  };

  // Metadata
  version: number;
  updatedAt: Date;
  createdAt: Date;
}
```

**Injection:** Almost always injected. Placed in system prompt. Cheap in tokens, high in value.

### L2: Fact Store

**Purpose:** Granular, searchable knowledge about the user.
**Storage:** Vector database with metadata filtering.
**Lifetime:** Persistent with decay. Superseded facts are soft-deleted.

```typescript
interface Fact {
  factId: string;
  userId: string;
  
  // Content
  content: string;              // Natural language fact
  category: FactCategory;       // 'project' | 'technical' | 'personal' | 'preference' | 'event'
  
  // Reliability
  confidence: number;           // 0.0–1.0
  source: {
    sessionId: string;
    extractedAt: Date;
    method: 'explicit' | 'inferred';  // User stated vs. AI inferred
  };

  // Lifecycle
  importance: number;           // 0.0–1.0, set at extraction time
  accessCount: number;
  lastAccessedAt: Date;
  decayScore: number;           // Computed: importance × recency × accessBonus
  
  // Versioning
  supersededBy: string | null;  // factId of replacement, if updated
  isActive: boolean;

  // Vector
  embedding: number[];

  createdAt: Date;
  updatedAt: Date;
}

type FactCategory =
  | 'project'       // Work projects, codebases, deadlines
  | 'technical'     // Tech stack, tools, libraries
  | 'personal'      // Family, hobbies, life events
  | 'preference'    // Likes, dislikes, communication style
  | 'relationship'  // People mentioned, team members
  | 'event';        // Dated occurrences
```

**Injection:** On-demand via semantic search. Controlled by Memory Router.

### L3: Episodic Memory

**Purpose:** Conversation-level summaries preserving narrative and temporal context.
**Storage:** Vector database.
**Lifetime:** Persistent with consolidation (multiple episodes merge over time).

```typescript
interface Episode {
  episodeId: string;
  userId: string;
  sessionId: string;

  // Narrative
  summary: string;              // What happened in this conversation
  keyDecisions: string[];       // Decisions made
  unresolvedItems: string[];    // Open questions for follow-up
  
  // Metadata
  topics: string[];             // Topic tags
  emotionalTone: string;        // 'frustrated' | 'exploratory' | 'urgent' | 'satisfied'
  messageCount: number;
  durationMinutes: number;

  // Vector
  embedding: number[];

  createdAt: Date;
}
```

**Injection:** Only when Memory Router detects temporal/anaphoric references ("last time", "continue", "our previous discussion").

---

## 6. Core Subsystems

### 6.1 Memory Router (Retrieval Decision Engine)

The Router answers: "Given this user message, which memory layers should we query, and how?"

```
User Message
     │
     ▼
┌─────────────────────────────────────────────┐
│ Stage 1: Rule-Based Fast Path (< 1ms)       │
│                                             │
│ • Anaphoric detection → trigger L3          │
│   ("last time", "before", "continue",       │
│    "we discussed", "上次", "之前", "继续")    │
│                                             │
│ • Self-reference detection → trigger L2     │
│   ("my project", "at my company",           │
│    "我的", "帮我", "我们公司")                │
│                                             │
│ • Pure-generic detection → L1 only          │
│   (no personal pronouns, no references)     │
│                                             │
│ • Confidence: HIGH → skip Stage 2           │
│ • Confidence: LOW  → continue to Stage 2    │
└──────────────────┬──────────────────────────┘
                   │ (ambiguous cases only)
                   ▼
┌─────────────────────────────────────────────┐
│ Stage 2: Classifier (optional, ~50ms)       │
│                                             │
│ • Lightweight model (fine-tuned distilbert  │
│   or Haiku-class LLM)                       │
│ • Input: user message + L1 profile summary  │
│ • Output: RoutingDecision                   │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ RoutingDecision                             │
│ {                                           │
│   injectProfile: true,        // L1         │
│   searchFacts: true,          // L2         │
│   factQuery: "EF Core Linux", // rewritten  │
│   factTopK: 5,                              │
│   searchEpisodes: false,      // L3         │
│   maxMemoryTokens: 800                      │
│ }                                           │
└─────────────────────────────────────────────┘
```

### 6.2 Memory Extractor (Learning Pipeline)

Runs asynchronously after each conversation (or after N turns, configurable).

```
Conversation Messages
        │
        ▼
┌────────────────────────────────────┐
│ Step 1: Extraction LLM Call        │
│                                    │
│ System: "Extract memorable facts   │
│ from this conversation. Output     │
│ structured JSON."                  │
│                                    │
│ Input: conversation + existing     │
│        profile (for dedup)         │
│                                    │
│ Output: ExtractionResult {         │
│   newFacts: Fact[]                 │
│   profileUpdates: Partial<Profile> │
│   episodeSummary: string           │
│   unresolvedItems: string[]        │
│ }                                  │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ Step 2: Dedup & Conflict Detection │
│                                    │
│ For each newFact:                  │
│  • Embed it                        │
│  • Search existing facts (cosine   │
│    similarity > 0.9 = duplicate)   │
│  • Check for contradiction         │
│    (semantic similarity + LLM      │
│     judge if ambiguous)            │
│  • Result: ADD / UPDATE / SKIP     │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ Step 3: Write                      │
│                                    │
│ • Insert new facts with embeddings │
│ • Mark superseded facts            │
│ • Merge profile updates            │
│ • Insert episode record            │
└────────────────────────────────────┘
```

### 6.3 Lifecycle Manager

Background process that maintains memory health.

**Decay:** Runs on a schedule (configurable, default: daily).
```
decayScore = importance × recencyFactor(daysSinceAccess) × log(1 + accessCount)

recencyFactor(days) = exp(-days / halfLife)    // halfLife default: 90 days
```

Facts with `decayScore < threshold` (default: 0.05) are marked inactive.

**Consolidation:** Merges related episodic memories.
```
When episodeCount for a topic cluster > 5:
  1. Retrieve all episodes in cluster
  2. LLM call: "Summarize these episodes into consolidated facts"
  3. Write new facts to L2
  4. Mark source episodes as consolidated
```

**Conflict Resolution:**
- New fact contradicts existing high-confidence fact → flag as `needs_confirmation`
- New fact contradicts existing low-confidence fact → supersede
- Developer can hook into conflict events for custom handling

---

## 7. Public API Design

### 7.1 Core API (Minimal Surface)

```typescript
// ── Initialization ──────────────────────────────────────────────
import { GoodMemory } from 'goodmemory';

const memory = new GoodMemory({
  llm: { provider: 'anthropic', apiKey: '...', model: 'claude-sonnet-4-20250514' },
  embedding: { provider: 'openai', apiKey: '...', model: 'text-embedding-3-small' },
  storage: { provider: 'postgres', connectionString: '...' },

  // Optional overrides
  router: { strategy: 'hybrid' },            // 'rules-only' | 'hybrid' | 'llm-only'
  extraction: { trigger: 'on-session-end' },  // 'on-session-end' | 'every-n-turns' | 'manual'
  tokenBudget: { maxMemoryTokens: 1500 },     // Hard cap on injected memory tokens
});

// ── Hot Path: Recall ─────────────────────────────────────────────
const ctx = await memory.recall(userId, {
  message: userMessage,
  sessionId: sessionId,          // optional, for L0 buffer management
  conversationHistory: messages,  // optional, current conversation
});

// ctx.systemPromptInjection: string  — block to prepend/append to your system prompt
// ctx.syntheticMessages: Message[]   — synthetic history messages (from episodes)
// ctx.metadata: {
//   factsUsed: Fact[],
//   episodesUsed: Episode[],
//   routingDecision: RoutingDecision,
//   tokenCount: number,
//   latencyMs: number,
// }

// ── Background Path: Learn ───────────────────────────────────────
await memory.learn(userId, {
  sessionId: sessionId,
  messages: fullConversation,
});

// ── Session Management ──────────────────────────────────────────
await memory.startSession(userId, sessionId);
await memory.endSession(userId, sessionId);    // triggers extraction

// ── Direct Memory CRUD (escape hatch) ───────────────────────────
await memory.addFact(userId, { content: '...', category: 'project' });
await memory.updateProfile(userId, { identity: { role: 'CTO' } });
await memory.deleteFact(userId, factId);
await memory.getUserProfile(userId);
await memory.searchFacts(userId, query, { topK: 10 });
await memory.getEpisodes(userId, { after: date, limit: 20 });

// ── Lifecycle (typically called by cron / background job) ───────
await memory.runDecay(userId);              // or memory.runDecayAll()
await memory.runConsolidation(userId);
await memory.exportMemory(userId);          // GDPR compliance
await memory.deleteAllMemory(userId);       // Right to be forgotten
```

### 7.2 Event System

```typescript
memory.on('fact:created',    (event) => { /* { userId, fact } */ });
memory.on('fact:superseded', (event) => { /* { userId, oldFact, newFact } */ });
memory.on('fact:conflict',   (event) => { /* { userId, existing, incoming, resolution } */ });
memory.on('profile:updated', (event) => { /* { userId, changes } */ });
memory.on('episode:created', (event) => { /* { userId, episode } */ });
memory.on('recall:complete', (event) => { /* { userId, decision, latencyMs, tokenCount } */ });
memory.on('learn:complete',  (event) => { /* { userId, factsAdded, factsUpdated } */ });
memory.on('error',           (event) => { /* { source, error, context } */ });
```

### 7.3 Framework Integrations (Separate Packages)

```typescript
// Express/Fastify middleware
import { goodMemoryMiddleware } from 'goodmemory/express';
app.use(goodMemoryMiddleware(memory));

// LangChain integration
import { GoodMemoryRetriever } from 'goodmemory/langchain';

// Vercel AI SDK integration
import { goodMemoryProvider } from 'goodmemory/vercel-ai';

// LangGraph integration
import { memoryNodes } from 'goodmemory/langgraph';
```

---

## 8. Storage Abstraction Layer

### 8.1 Interface Design

```typescript
// ── Vector Store Interface ──────────────────────────────────────
interface VectorStore {
  upsert(collection: string, records: VectorRecord[]): Promise<void>;
  search(collection: string, query: number[], options: SearchOptions): Promise<VectorSearchResult[]>;
  delete(collection: string, ids: string[]): Promise<void>;
  getById(collection: string, ids: string[]): Promise<VectorRecord[]>;
}

interface VectorRecord {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content: string;
}

interface SearchOptions {
  topK: number;
  filter?: MetadataFilter;
  minScore?: number;
}

// ── Document Store Interface (for profiles, sessions) ───────────
interface DocumentStore {
  get<T>(collection: string, id: string): Promise<T | null>;
  set<T>(collection: string, id: string, doc: T): Promise<void>;
  update<T>(collection: string, id: string, partial: Partial<T>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  query<T>(collection: string, filter: QueryFilter): Promise<T[]>;
}
```

### 8.2 Adapter Matrix

| Provider | Vector | Document | Notes |
|----------|--------|----------|-------|
| **PostgreSQL + pgvector** | ✅ | ✅ | Single-DB solution. Best for most users. |
| **SQLite + sqlite-vss** | ✅ | ✅ | Zero-dependency local dev. |
| **In-Memory** | ✅ | ✅ | Testing / prototyping only. |
| **Pinecone** | ✅ | ❌ | Pair with Postgres/Redis for docs. |
| **Qdrant** | ✅ | ❌ | Self-hosted or cloud. |
| **ChromaDB** | ✅ | ❌ | Python-native, Node client available. |
| **Redis** | ✅ (RediSearch) | ✅ | Good for high-throughput / caching. |
| **Supabase** | ✅ (pgvector) | ✅ | Managed Postgres, popular in indie dev. |
| **Turso (libSQL)** | ✅ | ✅ | Edge-friendly SQLite. |

**Default (zero-config):** SQLite + sqlite-vss. Works locally, no external services.
**Recommended (production):** PostgreSQL + pgvector. Single database, battle-tested.

---

## 9. LLM Abstraction Layer

GoodMemory uses LLMs for three internal tasks. All are behind a single adapter interface.

| Task | Purpose | Default Model | Token Budget |
|------|---------|---------------|-------------|
| **Extraction** | Parse conversations into facts/episodes | Sonnet-class | ~2000 in + ~500 out |
| **Summarization** | Compress conversation buffers | Haiku-class | ~4000 in + ~300 out |
| **Conflict Resolution** | Judge contradicting facts | Haiku-class | ~500 in + ~200 out |

```typescript
interface LLMAdapter {
  complete(request: LLMRequest): Promise<LLMResponse>;
}

interface LLMRequest {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  temperature: number;
  maxTokens: number;
  responseFormat?: 'json';
}
```

**Supported providers (v1):**
- Anthropic (Claude)
- OpenAI (GPT-4o, GPT-4o-mini)
- Local / Ollama (any OpenAI-compatible endpoint)

**Cost control:** Each internal LLM call is tagged with a purpose. Developers can set per-purpose model overrides (e.g., use Haiku for summarization, Sonnet for extraction) and per-user daily budgets.

---

## 10. Embedding Pipeline

### 10.1 Interface

```typescript
interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
  modelId: string;
}
```

### 10.2 Supported Providers

| Provider | Model | Dimensions | Cost | Notes |
|----------|-------|-----------|------|-------|
| OpenAI | text-embedding-3-small | 1536 | $0.02/1M tokens | Best cost/quality ratio |
| OpenAI | text-embedding-3-large | 3072 | $0.13/1M tokens | Higher quality |
| Cohere | embed-english-v3.0 | 1024 | $0.10/1M tokens | Good multilingual |
| Local | all-MiniLM-L6-v2 | 384 | Free | Via Ollama / transformers.js |
| Voyage AI | voyage-3 | 1024 | $0.06/1M tokens | Strong on code |

### 10.3 Caching Strategy

Embeddings are cached in the document store with content-hash keys. Identical text is never embedded twice. Cache invalidation is content-addressed — if the text changes, the hash changes.

### 10.4 Multilingual Handling

Fact content is stored in the user's language (detected from the conversation). Embedding models with strong multilingual support (Cohere, OpenAI v3) are preferred. Cross-language retrieval works natively when the embedding model supports it.

---

## 11. Memory Router — Intelligent Retrieval

### 11.1 Routing Strategies

```typescript
type RouterStrategy = 'rules-only' | 'hybrid' | 'llm-only';
```

**rules-only** — Zero LLM cost. Fast. Sufficient for 70-80% of queries.
**hybrid** (default) — Rules first, LLM classifier for ambiguous cases.
**llm-only** — Maximum accuracy. Higher latency and cost.

### 11.2 Rule Engine Detail

```typescript
interface RoutingRule {
  name: string;
  condition: (message: string, profile: UserProfile | null) => boolean;
  action: Partial<RoutingDecision>;
  priority: number;    // Higher = checked first
  confidence: number;  // If > threshold, skip subsequent rules
}

// Built-in rules (examples):
const BUILT_IN_RULES: RoutingRule[] = [
  {
    name: 'anaphoric-reference',
    condition: (msg) => /\b(last time|before|previous|earlier|继续|上次|之前|我们讨论的)\b/i.test(msg),
    action: { searchEpisodes: true, searchFacts: true },
    priority: 100,
    confidence: 0.9,
  },
  {
    name: 'self-reference',
    condition: (msg) => /\b(my |I |me |mine |our |我的|帮我|我们|我公司)\b/i.test(msg),
    action: { searchFacts: true },
    priority: 80,
    confidence: 0.7,
  },
  {
    name: 'pure-generic',
    condition: (msg, profile) => {
      // No personal pronouns, no project names from profile
      const hasPersonal = /\b(my|I|me|our|我|我的)\b/i.test(msg);
      const mentionsKnownEntity = profile?.activeContext.currentProjects
        .some(p => msg.toLowerCase().includes(p.toLowerCase()));
      return !hasPersonal && !mentionsKnownEntity;
    },
    action: { searchFacts: false, searchEpisodes: false },
    priority: 50,
    confidence: 0.8,
  },
];
```

### 11.3 Query Rewriting

When the Router decides to search L2/L3, it must generate a good search query. The user's raw message is often not a good vector search query.

Strategy: If the message is short and focused, use it directly. If it's long or conversational, extract key terms using a lightweight LLM call or a keyword extraction algorithm (YAKE, KeyBERT).

```
User: "嘿，上次我们说的那个 Elsa Workflow 注册 Activity 的问题，后来我发现还有一个坑"
                              │
                    Query Rewriting
                              │
                              ▼
Fact query:  "Elsa Workflow Activity 注册"
Episode query: "Elsa Workflow Activity 问题"
```

---

## 12. Memory Lifecycle Management

### 12.1 Decay Model

```
Score(fact, now) =
    fact.importance
  × exp(-(daysSince(fact.lastAccessedAt, now)) / halfLife)
  × log2(1 + fact.accessCount)
  × (fact.source.method === 'explicit' ? 1.2 : 1.0)
```

| Parameter | Default | Configurable |
|-----------|---------|-------------|
| `halfLife` | 90 days | Yes |
| `deactivationThreshold` | 0.05 | Yes |
| `deletionThreshold` | 0.01 | Yes (soft-delete only by default) |

### 12.2 Consolidation Pipeline

```
Trigger: episodeCount(userId, topicCluster) > consolidationThreshold (default: 5)

Steps:
1. Cluster episodes by topic similarity (cosine > 0.7)
2. For each cluster exceeding threshold:
   a. Retrieve all episodes in cluster
   b. LLM call: "These are N episodes about [topic]. 
      Extract consolidated facts and a single summary."
   c. Write new consolidated facts to L2
   d. Write one merged episode to L3, link to originals
   e. Mark original episodes as 'consolidated'
```

### 12.3 Conflict Resolution Protocol

```
When Extractor detects a potential contradiction:

1. Compute semantic similarity between new and existing fact
2. If similarity > 0.85 AND content is contradictory:
   a. If existing.confidence < 0.5 → auto-supersede
   b. If existing.confidence >= 0.5:
      - If new fact is from explicit user statement → supersede
      - If new fact is inferred → mark as needs_confirmation
      - Emit 'fact:conflict' event for developer handling
```

---

## 13. Prompt Assembly Engine

### 13.1 Template System

```typescript
interface PromptTemplate {
  profileSection: (profile: UserProfile) => string;
  factsSection: (facts: Fact[]) => string;
  episodesSection: (episodes: Episode[]) => string;
  bufferSummarySection: (summary: string) => string;
}
```

Default template produces:

```
<user_memory>
<profile>
Name: Jianqin Huang | Role: Software Engineer at Gurki
Skills: C#/.NET 8, DDD, WPF, EF Core, Elsa Workflow
Domains: Industrial Robotics, AI Agents, Quantitative Trading
Style: Detailed responses in Chinese, with code examples
Goals: Ship robot prototype by Jan 2026; transition to Web3
</profile>

<relevant_context>
- Gurki project uses TCP+JSON protocol with heartbeat and sequence numbers
- Robot milestone: prototype by end of Jan 2026, first-gen by May-Aug 2026
- User preparing probation review PPT (probation period ending soon)
</relevant_context>

<recent_interactions>
- 3 days ago: Resolved Elsa Workflow custom Activity registration issue
- Last week: EF Core migration Linux deployment path issue (unresolved)
</recent_interactions>
</user_memory>
```

### 13.2 Token Budgeting

```typescript
interface TokenBudget {
  maxMemoryTokens: number;       // Total cap (default: 1500)
  allocation: {
    profile: number;             // Reserved for L1 (default: 400)
    facts: number;               // Max for L2 (default: 600)
    episodes: number;            // Max for L3 (default: 300)
    bufferSummary: number;       // Max for L0 summary (default: 200)
  };
  overflow: 'truncate' | 'prioritize-recency' | 'prioritize-relevance';
}
```

When retrieved content exceeds budget:
1. Profile is never truncated (it's always within budget by design).
2. Facts are ranked by `relevanceScore × decayScore` and truncated from bottom.
3. Episodes are truncated from oldest.
4. Buffer summary is compressed further if needed.

---

## 14. Observability & Debugging

### 14.1 Memory Inspector CLI

```bash
npx goodmemory inspect <userId>           # View profile + top facts + recent episodes
npx goodmemory inspect <userId> --facts    # List all active facts with scores
npx goodmemory inspect <userId> --episodes # List all episodes
npx goodmemory trace <userId> <sessionId>  # Show routing decisions for a session
npx goodmemory export <userId>             # Export all memory as JSON (GDPR)
npx goodmemory stats                       # Storage usage, cost estimates
```

### 14.2 Structured Logging

Every operation emits structured logs:

```json
{
  "event": "recall",
  "userId": "u_123",
  "routingDecision": { "searchFacts": true, "factTopK": 5, "searchEpisodes": false },
  "factsRetrieved": 3,
  "tokensInjected": 847,
  "latencyMs": 123,
  "cacheHit": false
}
```

### 14.3 Dashboard (Optional Add-on)

A web UI (React-based) for visualizing memory per user: fact timeline, episode graph, profile evolution, cost tracking. Shipped as a separate package (`goodmemory-dashboard`).

---

## 15. Security & Privacy

### 15.1 Data Isolation

Every query is scoped by `userId`. There is no API or code path that allows cross-user memory access. Vector searches include `userId` as a mandatory filter.

### 15.2 PII Handling

GoodMemory provides optional PII detection + redaction before storage:

```typescript
const memory = new GoodMemory({
  privacy: {
    piiDetection: true,           // Detect PII in extracted facts
    piiAction: 'redact',          // 'redact' | 'flag' | 'block'
    sensitiveCategories: ['ssn', 'credit_card', 'phone'],
  },
});
```

### 15.3 GDPR / Right to Erasure

```typescript
// Export all data for a user (data portability)
const dump = await memory.exportMemory(userId);

// Complete deletion (right to be forgotten)
await memory.deleteAllMemory(userId);
// Deletes: profile, all facts, all episodes, all embeddings, all session data
```

### 15.4 Encryption

- At-rest encryption delegated to the storage provider (e.g., Postgres TDE, encrypted SQLite).
- Optional field-level encryption for fact content (AES-256-GCM) when `privacy.encryptAtRest: true`.
- Embedding vectors are NOT encrypted (they must be searchable), but they are not reversible to original text.

---

## 16. Performance Budget

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| `recall()` — rules-only routing, L1 only | < 10ms | Cache hit on profile |
| `recall()` — rules-only routing, L1 + L2 search | < 100ms | Vector search + assembly |
| `recall()` — hybrid routing, L1 + L2 + L3 | < 300ms | Includes classifier call |
| `learn()` — async extraction | < 5s | Non-blocking, background |
| `runDecay()` per user | < 1s | Batch update scores |
| `runConsolidation()` per user | < 30s | Includes LLM call |

**Cold start (first call for a user with no memory):** < 50ms.
Profile returns null → Router returns L1-only → minimal injection.

---

## 17. Package Structure & Monorepo Layout

```
goodmemory/
├── packages/
│   ├── core/                        # Main package: goodmemory
│   │   ├── src/
│   │   │   ├── index.ts             # Public API
│   │   │   ├── memory.ts            # GoodMemory class
│   │   │   ├── router/
│   │   │   │   ├── index.ts
│   │   │   │   ├── rules.ts         # Built-in routing rules
│   │   │   │   ├── classifier.ts    # LLM-based classifier
│   │   │   │   └── types.ts
│   │   │   ├── extractor/
│   │   │   │   ├── index.ts
│   │   │   │   ├── prompts.ts       # Extraction prompt templates
│   │   │   │   └── dedup.ts         # Deduplication logic
│   │   │   ├── lifecycle/
│   │   │   │   ├── decay.ts
│   │   │   │   ├── consolidation.ts
│   │   │   │   └── conflict.ts
│   │   │   ├── assembler/
│   │   │   │   ├── index.ts
│   │   │   │   ├── templates.ts
│   │   │   │   └── budget.ts        # Token budgeting
│   │   │   ├── store/
│   │   │   │   ├── interfaces.ts    # VectorStore, DocumentStore
│   │   │   │   ├── buffer.ts        # L0 conversation buffer
│   │   │   │   ├── profile.ts       # L1 profile manager
│   │   │   │   ├── facts.ts         # L2 fact store logic
│   │   │   │   └── episodes.ts      # L3 episode store logic
│   │   │   ├── adapters/
│   │   │   │   ├── llm/
│   │   │   │   │   ├── interface.ts
│   │   │   │   │   ├── anthropic.ts
│   │   │   │   │   ├── openai.ts
│   │   │   │   │   └── ollama.ts
│   │   │   │   ├── embedding/
│   │   │   │   │   ├── interface.ts
│   │   │   │   │   ├── openai.ts
│   │   │   │   │   ├── cohere.ts
│   │   │   │   │   └── local.ts
│   │   │   │   └── storage/
│   │   │   │       ├── interface.ts
│   │   │   │       ├── sqlite.ts    # Default: zero-dep local
│   │   │   │       ├── postgres.ts
│   │   │   │       ├── pinecone.ts
│   │   │   │       ├── qdrant.ts
│   │   │   │       ├── redis.ts
│   │   │   │       └── memory.ts    # In-memory (testing)
│   │   │   └── utils/
│   │   │       ├── tokenizer.ts     # Token counting
│   │   │       ├── hashing.ts       # Content-addressed caching
│   │   │       └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                         # goodmemory CLI tool
│   │   └── ...
│   │
│   ├── dashboard/                   # Web UI (optional)
│   │   └── ...
│   │
│   └── integrations/                # Framework adapters
│       ├── langchain/
│       ├── langgraph/
│       ├── vercel-ai/
│       └── express/
│
├── examples/
│   ├── basic-chatbot/               # Minimal example
│   ├── express-api/                  # REST API with memory
│   ├── langgraph-agent/              # LangGraph integration
│   └── multi-tenant-saas/            # Production-like setup
│
├── docs/
│   ├── getting-started.md
│   ├── architecture.md              # This document
│   ├── configuration.md
│   ├── adapters.md
│   ├── api-reference.md
│   └── cost-optimization.md
│
├── benchmarks/                       # Performance tests
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml
└── README.md
```

---

## 18. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript 5.x | Target audience is JS/TS developers; npm ecosystem |
| Runtime | Node.js 20+ | LTS, native fetch, good async perf |
| Build | tsup | Fast, zero-config TS bundler |
| Monorepo | Turborepo + pnpm | Industry standard for JS monorepos |
| Testing | Vitest | Fast, TS-native, good DX |
| Tokenizer | tiktoken (via @anthropic-ai/tokenizer or js-tiktoken) | Accurate token counting for budgeting |
| Schema Validation | Zod | Runtime validation of configs and LLM outputs |
| Logging | pino | Fast structured logging |
| CI/CD | GitHub Actions | Standard for open-source |
| Docs | VitePress | Clean, fast docs site |
| Linting | Biome | Fast, all-in-one formatter + linter |

---

## 19. Development Roadmap

### Phase 0: Foundation (Weeks 1–3)

**Goal:** Skeleton that compiles, tests run, CI passes.

- [ ] Monorepo setup (Turborepo + pnpm + Biome + Vitest)
- [ ] Define all TypeScript interfaces (memory model, adapters, config)
- [ ] Implement in-memory storage adapter (for testing)
- [ ] Implement `GoodMemory` class shell with `recall()` and `learn()` stubs
- [ ] Token counting utility
- [ ] Basic structured logging
- [ ] CI pipeline (lint, typecheck, test, build)
- [ ] README with vision statement and API preview

### Phase 1: Core Memory Loop (Weeks 4–7)

**Goal:** End-to-end memory working with one LLM + one storage backend.

- [ ] L0: Conversation buffer with sliding window
- [ ] L1: User profile CRUD
- [ ] L2: Fact store with embedding + vector search
- [ ] L3: Episode store with embedding + vector search
- [ ] Memory Extractor: extraction prompts + structured output parsing
- [ ] Memory Router: rules-only strategy
- [ ] Prompt Assembler: default template + token budgeting
- [ ] Anthropic LLM adapter
- [ ] OpenAI embedding adapter
- [ ] SQLite + sqlite-vss storage adapter
- [ ] Integration test: full recall → LLM → learn cycle
- [ ] `basic-chatbot` example

### Phase 2: Production Hardening (Weeks 8–11)

**Goal:** Production-ready for single-tenant use cases.

- [ ] PostgreSQL + pgvector storage adapter
- [ ] OpenAI LLM adapter
- [ ] Cohere + local embedding adapters
- [ ] Memory Router: hybrid strategy (rules + classifier)
- [ ] Lifecycle Manager: decay + consolidation
- [ ] Conflict resolution protocol
- [ ] Deduplication pipeline
- [ ] Query rewriting for vector search
- [ ] Event system (EventEmitter-based)
- [ ] PII detection + redaction (optional)
- [ ] GDPR: export + delete
- [ ] Comprehensive test suite (unit + integration + e2e)
- [ ] Performance benchmarks
- [ ] `express-api` example

### Phase 3: Ecosystem (Weeks 12–16)

**Goal:** Framework integrations, CLI, docs site, community launch.

- [ ] CLI tool (`goodmemory inspect`, `trace`, `export`, `stats`)
- [ ] Pinecone adapter
- [ ] Qdrant adapter
- [ ] Redis adapter
- [ ] LangChain integration package
- [ ] LangGraph integration package
- [ ] Vercel AI SDK integration
- [ ] Express/Fastify middleware
- [ ] Ollama / local LLM adapter
- [ ] VitePress documentation site
- [ ] `langgraph-agent` example
- [ ] `multi-tenant-saas` example
- [ ] npm publish (v0.1.0)
- [ ] GitHub release + announcement

### Phase 4: Scale & Intelligence (Weeks 17–24)

**Goal:** Multi-tenant production, advanced features, community growth.

- [ ] Multi-tenant isolation (namespace-level separation)
- [ ] Dashboard web UI (goodmemory-dashboard)
- [ ] Custom routing rules API
- [ ] Custom extraction prompt templates
- [ ] Batch operations (bulk decay, bulk consolidation)
- [ ] Memory compression (progressive summarization)
- [ ] Cross-session topic tracking
- [ ] Streaming support for recall (partial injection)
- [ ] Cost tracking and usage analytics
- [ ] Plugin system for custom adapters
- [ ] v1.0.0 release

---

## 20. Competitive Analysis

| Project | Type | Memory Model | Strengths | Weaknesses |
|---------|------|-------------|-----------|------------|
| **Mem0** | Open-source lib | Flat fact store | Simple API, active community | No layered memory, no routing, no lifecycle |
| **Zep** | Managed service + OSS | Facts + summaries | Good extraction, managed hosting | Vendor lock-in, no profile layer, heavy |
| **LangChain Memory** | Framework module | Buffer + summary + entity | Framework integration | Tightly coupled to LangChain, basic retrieval |
| **Motorhead** | Redis-based | Buffer + long-term | Fast, Redis-native | No semantic search, no lifecycle |
| **ChatGPT Memory** | Platform feature | Opaque | Zero effort | No control, vendor lock-in, not programmable |
| **Claude Memory** | Platform feature | Profile-style | Good extraction | No control, vendor lock-in, not programmable |

**GoodMemory's differentiation:**
1. **Four-layer model** — most competitors have 1-2 layers at best
2. **Intelligent routing** — no competitor does retrieval routing; all do brute-force or nothing
3. **Token budgeting** — explicit cost control, not "hope it fits"
4. **Full lifecycle** — decay, consolidation, conflict resolution
5. **Zero lock-in** — every component pluggable
6. **Developer-first** — CLI inspector, event system, structured logging

---

## 21. Open-Source Strategy

### 21.1 License

**MIT License.** Maximum adoption. No friction for commercial use.

### 21.2 Monetization Path (if desired)

The open-source core is fully functional. Potential future revenue:

- **GoodMemory Cloud:** Managed hosting (storage + embedding + lifecycle as a service)
- **Dashboard Pro:** Advanced analytics, team collaboration, A/B testing memory strategies
- **Enterprise Support:** SLAs, priority support, custom adapter development
- **Consulting:** Architecture review for large-scale memory implementations

### 21.3 Community Building

- GitHub Discussions for Q&A
- Discord server for real-time help
- Monthly "Memory Matters" blog posts (architecture deep-dives)
- Conference talks (AI Engineer Summit, Node Congress, etc.)
- Contributor-friendly: `good-first-issue` labels, clear CONTRIBUTING.md
- Showcase: directory of projects built with GoodMemory

### 21.4 Quality Gates

- 90%+ test coverage on core package
- Every PR requires: passing CI, type-check, lint, at least one review
- Semantic versioning strictly followed
- Breaking changes only in major versions with migration guides
- Every adapter has integration tests against real services (in CI with Docker)

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Recall** | The process of retrieving relevant memories and assembling them for LLM injection |
| **Learn** | The process of extracting new memories from a conversation |
| **Fact** | An atomic piece of knowledge about the user (L2) |
| **Episode** | A summary of a complete conversation interaction (L3) |
| **Profile** | A compressed, structured representation of the user (L1) |
| **Buffer** | The current session's conversation history (L0) |
| **Routing** | Deciding which memory layers to query for a given message |
| **Decay** | Gradual reduction of memory relevance over time |
| **Consolidation** | Merging multiple related memories into a more compact form |
| **Supersede** | Replacing an outdated fact with a newer version |

---

## Appendix B: Configuration Reference

```typescript
interface GoodMemoryConfig {
  // Required
  llm: LLMConfig;
  storage: StorageConfig;
  embedding: EmbeddingConfig;

  // Optional
  router?: {
    strategy: 'rules-only' | 'hybrid' | 'llm-only';
    customRules?: RoutingRule[];
    classifierModel?: string;        // Model for hybrid classifier
  };

  extraction?: {
    trigger: 'on-session-end' | 'every-n-turns' | 'manual';
    turnInterval?: number;           // For 'every-n-turns' (default: 10)
    model?: string;                  // Override LLM model for extraction
    conservativeMode?: boolean;      // Higher confidence threshold (default: true)
  };

  lifecycle?: {
    decay: {
      enabled: boolean;              // default: true
      halfLifeDays: number;          // default: 90
      deactivationThreshold: number; // default: 0.05
      schedule: string;              // cron expression (default: daily)
    };
    consolidation: {
      enabled: boolean;              // default: true
      episodeThreshold: number;      // default: 5
      schedule: string;              // cron expression (default: weekly)
    };
  };

  tokenBudget?: {
    maxMemoryTokens: number;         // default: 1500
    allocation?: {
      profile: number;               // default: 400
      facts: number;                 // default: 600
      episodes: number;              // default: 300
      bufferSummary: number;         // default: 200
    };
  };

  privacy?: {
    piiDetection: boolean;           // default: false
    piiAction: 'redact' | 'flag' | 'block';
    encryptAtRest: boolean;          // default: false
    encryptionKey?: string;
  };

  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    structured: boolean;             // default: true
  };
}
```
