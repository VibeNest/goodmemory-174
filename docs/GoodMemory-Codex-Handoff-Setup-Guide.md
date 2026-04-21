# GoodMemory Codex Handoff Setup Guide

This is the canonical Bun-only `0.1.0-rc.1` Codex host setup path.

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

1. Install GoodMemory with Bun.
2. Create a GoodMemory instance and a host adapter using public imports only.
3. Keep the host in `file-assisted` mode.
4. Export/read `session-memory/<sessionId>.md` through `goodmemory/host`.
5. For repo-local comparison only, run the canonical handoff example:
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

- `0.1.0-rc.1` is Bun-only.
- Codex handoff is the only gate-blocking host path for Phase 27.
- The recommended default mode remains `file-assisted`.
- The host path should use only:
  - `goodmemory`
  - `goodmemory/host`

## What This Guide Proves

- compiled artifacts can be consumed through the public host adapter surface
- Codex-style handoff can restore session context without redefining canonical truth
- the public host surface is usable without repo-internal imports
- the same host surface is installable from the packed release artifact
