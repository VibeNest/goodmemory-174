# GoodMemory Reference Integration Guide

This is the canonical packaged `0.1.0-rc.1` reference path for chatbox/copilot-style integration.

## Install

Published install:

```bash
npm install goodmemory@0.1.0-rc.1
```

Bun install:

```bash
bun add goodmemory@0.1.0-rc.1
```

Tarball verification of the same release artifact before publish:

```bash
npm install ./goodmemory-0.1.0-rc.1.tgz
```

## Quick Path

1. Install the package with npm or Bun and keep the default public runtime entrypoint: `createGoodMemory({})`
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

- `goodmemory` and `goodmemory/ai-sdk` now resolve through compiled package artifacts on both Node and Bun.
- The canonical deterministic path uses the accepted Phase 26 local-first runtime and the accepted Phase 28 supported local acceleration behavior.
- Bun keeps the local SQLite default runtime path; Node zero-config runtime currently falls back to in-memory when the built-in local SQLite adapter is unavailable.
- No embedding environment variables means the runtime stays `rules-only`.
- Tarball and registry installability are both valid package-boundary paths for this RC.
- The reference path should use only:
  - `goodmemory`
  - `goodmemory/ai-sdk`

## What This Guide Proves

- public imports are enough for the reference integration path
- the default runtime can stand up a working memory loop without repo-internal imports
- the AI SDK wrapper can augment recall and remember on the public surface
- the same public surface is installable from the packed release artifact or from registry install, not only from a repo checkout
