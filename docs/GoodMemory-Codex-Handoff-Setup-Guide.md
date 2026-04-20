# GoodMemory Codex Handoff Setup Guide

This is the canonical Phase 27 host setup path.

## Quick Path

1. Create a GoodMemory instance and a host adapter using public imports only.
2. Keep the host in `file-assisted` mode.
3. Export/read `session-memory/<sessionId>.md` through `goodmemory/host`.
4. Run the canonical handoff example:
   `bun run example:host-codex`

## Canonical Setup

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
```

## Stable Contract

- Codex handoff is the only gate-blocking host path for Phase 27.
- The recommended default mode remains `file-assisted`.
- The host path should use only:
  - `goodmemory`
  - `goodmemory/host`

## What This Guide Proves

- compiled artifacts can be consumed through the public host adapter surface
- Codex-style handoff can restore session context without redefining canonical truth
- the public host surface is usable without repo-internal imports
