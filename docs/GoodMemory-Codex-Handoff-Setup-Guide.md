# GoodMemory Codex Handoff Setup Guide

This is the canonical Bun-only `0.1.0-rc.1` Codex bootstrap path on the installed package surface.

## Install

Published RC install:

```bash
bun add goodmemory@0.1.0-rc.1
```

Tarball verification of the same release artifact before publish:

```bash
bun add ./goodmemory-0.1.0-rc.1.tgz
```

## Bootstrap

Run the installed-package bootstrap from the workspace that should expose GoodMemory to Codex:

```bash
./node_modules/.bin/goodmemory codex bootstrap --user-id <user-id> --workspace-id <workspace-id>
```

This creates repo-local scaffolding only:

- `AGENTS.md`
- `.goodmemory/bootstrap/codex-export.mjs`

The bootstrap step does not create canonical memory state or depend on a repo checkout of GoodMemory itself.

## Refresh Exported Artifacts

After your app or integration writes canonical GoodMemory state through the public package surface, refresh the Codex-facing compiled artifacts:

```bash
bun ./.goodmemory/bootstrap/codex-export.mjs --session-id <session-id>
```

Pass the real active session id. `session-memory/current.md` is only emitted when that session has runtime continuity to export.

Codex should read the compiled files under:

- `./.goodmemory/hosts/codex/session-memory/current.md`
- `./.goodmemory/hosts/codex/MEMORY.md`
- `./.goodmemory/hosts/codex/playbooks/*.md`

Treat those files as compiled guidance, not canonical truth.

## Public Wiring Contract

The generated bootstrap script uses public package imports only:

```ts
import { createGoodMemory } from "goodmemory";
import { createHostAdapter } from "goodmemory/host";
```

## Stable Contract

- `0.1.0-rc.1` is Bun-only.
- Codex remains the only live gate-blocking host path for Phase 32.
- The generated bootstrap path keeps the recommended `file-assisted` read flow.
- The host path should use only:
  - `goodmemory`
  - `goodmemory/host`

## What This Guide Proves

- the installed package can scaffold Codex wiring without repo-internal imports
- generated Codex-facing artifact refresh stays on the public package surface
- Codex-style handoff can read compiled session continuity without redefining canonical truth
- the bootstrap path is repo-local, idempotent, and does not implicitly create canonical memory state
