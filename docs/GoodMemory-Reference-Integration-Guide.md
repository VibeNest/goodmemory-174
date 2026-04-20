# GoodMemory Reference Integration Guide

This is the canonical Phase 27 reference path for chatbox/copilot-style integration.

## Quick Path

1. Install the package and keep the default local-first runtime:
   `createGoodMemory({})`
2. Wrap your AI SDK model call with `createGoodMemoryAISDK(...)`.
3. Pass normal `ModelMessage[]` input plus a scoped `userId` / `workspaceId` / `sessionId`.
4. Run the reference example:
   `bun run example:vercel-ai`

## Canonical Integration

```ts
import { createGoodMemory } from "goodmemory";
import { createGoodMemoryAISDK } from "goodmemory/ai-sdk";

const memory = createGoodMemory({});

const aiSDK = createGoodMemoryAISDK({
  memory,
});
```

## Stable Contract

- The canonical deterministic path uses the accepted Phase 26 local-first runtime.
- No embedding environment variables means the runtime stays `rules-only`.
- The reference path should use only:
  - `goodmemory`
  - `goodmemory/ai-sdk`

## What This Guide Proves

- public imports are enough for the reference integration path
- the default runtime can persist local state without explicit storage config
- the AI SDK wrapper can augment recall and remember on the public surface
