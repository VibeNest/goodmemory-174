# GoodMemory Reference Integration Guide

This is the canonical packaged `0.1.1` reference path for chatbox/copilot-style integration.

## Install

Published install:

```bash
npm install goodmemory@0.1.1
```

Bun install:

```bash
bun add goodmemory@0.1.1
```

Tarball verification of the same release artifact before publish:

```bash
npm install ./goodmemory-0.1.1.tgz
```

## Quick Path

1. Install the package with npm or Bun and keep the default public runtime entrypoint: `createGoodMemory({})`
2. Build one plain server handler around `createGoodMemoryAISDK(...)`.
3. Accept normal `ModelMessage[]` input plus a scoped `userId` / `workspaceId` / `sessionId`.
4. For repo-local comparison only, run the reference example:
   `bun run example:ai-sdk-server`

## Canonical Integration

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

Next.js mapping:

- `export async function POST(request: Request)` can delegate directly to the same handler body.
- The repo-local canonical example is `examples/plain-ai-sdk-server.ts`.
- `examples/vercel-ai-chat.ts` remains as the lower-level wrapper-first example.
- The HTTP boundary should reject malformed `scope` input instead of silently soft-failing memory semantics.

## Stable Contract

- `goodmemory` and `goodmemory/ai-sdk` now resolve through compiled package artifacts on both Node and Bun.
- The canonical deterministic path uses the accepted Phase 26 local-first runtime and the accepted Phase 28 supported local acceleration behavior.
- Bun keeps the local SQLite default runtime path; Node zero-config runtime currently falls back to in-memory when the built-in local SQLite adapter is unavailable.
- No embedding environment variables means the runtime stays `rules-only`.
- Tarball and registry installability are both valid package-boundary paths for this stable release.
- The reference path should use only:
  - `goodmemory`
  - `goodmemory/ai-sdk`

## What This Guide Proves

- public imports are enough for the reference integration path
- the default runtime can stand up a working memory loop without repo-internal imports
- the canonical public path is a plain AI SDK server that returns `Request -> Response` through `toTextStreamResponse()`
- the AI SDK wrapper can augment recall and remember on the public surface
- the same public surface is installable from the packed release artifact or from registry install, not only from a repo checkout
