# GoodMemory Codex Handoff Setup Guide

This is the canonical installed-package `0.1.1` Codex bootstrap path.

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

## Bootstrap

Run the installed-package bootstrap from the workspace that should expose GoodMemory to Codex:

```bash
./node_modules/.bin/goodmemory codex bootstrap --user-id <user-id> --workspace-id <workspace-id>
```

This creates repo-local scaffolding only:

- `AGENTS.md`
- `.goodmemory/bootstrap/codex-export.mjs`
- `.goodmemory/bootstrap/codex-action.mjs`
- `.codex/hooks.json`
- `.codex/config.toml`
- `codex/rules/goodmemory.rules`

The bootstrap step does not create canonical memory state or depend on a repo checkout of GoodMemory itself.

## Refresh Exported Artifacts

After your app or integration writes canonical GoodMemory state through the public package surface, refresh the Codex-facing compiled artifacts:

```bash
bun ./.goodmemory/bootstrap/codex-export.mjs --session-id <session-id>
```

Pass the real active session id. `session-memory/current.md` is only emitted when that session has runtime continuity to export.

For risky Bash commands, route execution through the installed action-gate wrapper instead of calling the raw command directly:

```bash
bun ./.goodmemory/bootstrap/codex-action.mjs --session-id <session-id> --command "<command>"
```

Treat `.goodmemory/bootstrap/codex-action.mjs` as the canonical enforced path. `.codex/hooks.json` and `codex/rules/goodmemory.rules` are generated as parity scaffolds when the current Codex runtime supports them.

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

- `goodmemory` and `goodmemory/host` now resolve through compiled package artifacts on both Node and Bun.
- The installed bootstrap CLI remains Bun-backed today.
- Codex remains the only live gate-blocking host path for Phase 34.
- The generated bootstrap path keeps the recommended `file-assisted` read flow.
- The action-gate wrapper is the canonical live enforcement path for risky first-step rewrite and veto outcomes.
- The host path should use only:
  - `goodmemory`
  - `goodmemory/host`

## What This Guide Proves

- the installed package can scaffold Codex wiring without repo-internal imports
- generated Codex-facing artifact refresh stays on the public package surface
- the generated action-gate wrapper can enforce pre-action rewrite and veto decisions through public imports only
- Codex-style handoff can read compiled session continuity without redefining canonical truth
- the bootstrap path is repo-local, idempotent, and does not implicitly create canonical memory state
