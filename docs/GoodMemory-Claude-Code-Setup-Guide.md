# GoodMemory Claude Code Setup Guide

This is the canonical Bun-only `0.1.0-rc.1` Claude Code bootstrap path on the installed package surface.

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

Run the installed-package bootstrap from the workspace that should expose GoodMemory to Claude Code:

```bash
./node_modules/.bin/goodmemory claude bootstrap --user-id <user-id> --workspace-id <workspace-id>
```

This creates repo-local scaffolding only:

- `CLAUDE.md`
- `.goodmemory/bootstrap/claude-export.mjs`

The bootstrap step does not create canonical memory state or depend on a repo checkout of GoodMemory itself.

## Refresh Exported Artifacts

After your app or integration writes canonical GoodMemory state through the public package surface, refresh the Claude-facing compiled artifacts:

```bash
bun ./.goodmemory/bootstrap/claude-export.mjs
```

Claude should read the compiled files under:

- `./.goodmemory/hosts/claude/MEMORY.md`
- `./.goodmemory/hosts/claude/user.md`
- `./.goodmemory/hosts/claude/playbooks/*.md`

Treat those files as compiled guidance, not canonical truth.

## Public Wiring Contract

The generated bootstrap script uses public package imports only:

```ts
import { createGoodMemory } from "goodmemory";
import { createHostAdapter } from "goodmemory/host";
```

## Stable Contract

- `0.1.0-rc.1` is Bun-only.
- Claude Code bootstrap is supported for external usability and package-boundary parity.
- Codex remains the only live gate-blocking host path for Phase 32.
- The host bootstrap path should use only:
  - `goodmemory`
  - `goodmemory/host`

## What This Guide Proves

- the installed package can scaffold Claude Code wiring without repo-internal imports
- generated Claude-facing artifact refresh stays on the public package surface
- the bootstrap path is repo-local, idempotent, and does not implicitly create canonical memory state
