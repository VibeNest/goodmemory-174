# GoodMemory Reference Integration Guide

This is the canonical Bun-only `0.1.0-rc.1` reference path for chatbox/copilot-style integration.

## Install

Published RC install:

```bash
bun add goodmemory@0.1.0-rc.1
```

Tarball verification of the same release artifact before publish:

```bash
bun add ./goodmemory-0.1.0-rc.1.tgz
```

## Quick Path

1. Install the package with Bun and keep the default local-first runtime: `createGoodMemory({})`
2. Wrap your AI SDK model call with `createGoodMemoryAISDK(...)`.
3. Pass normal `ModelMessage[]` input plus a scoped `userId` / `workspaceId` / `sessionId`.
4. For repo-local comparison only, run the reference example:
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

- `0.1.0-rc.1` is Bun-only. This guide does not promise Node compatibility.
- The canonical deterministic path uses the accepted Phase 26 local-first runtime and the accepted Phase 28 supported local acceleration behavior.
- No embedding environment variables means the runtime stays `rules-only`.
- Tarball-first installability is the release artifact contract for this RC.
- The reference path should use only:
  - `goodmemory`
  - `goodmemory/ai-sdk`

## What This Guide Proves

- public imports are enough for the reference integration path
- the default runtime can persist local state without explicit storage config
- the AI SDK wrapper can augment recall and remember on the public surface
- the same public surface is installable from the packed release artifact, not only from a repo checkout
