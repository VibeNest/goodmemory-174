# Publishing GoodMemory to the MCP Registry

This is a **maintainer action**. It lists GoodMemory in the official
[MCP registry](https://github.com/modelcontextprotocol/registry) so agents and
hosts that discover MCP servers through the registry can find GoodMemory. It is
not needed to *use* GoodMemory.

The registry hosts metadata only, not artifacts — the npm package is published
separately and first.

## What is already prepared

- [`server.json`](../server.json) at the repo root — the registry manifest,
  conforming to the pinned `2025-12-11` schema. It launches the standalone
  read-only MCP server via `npx -y goodmemory mcp serve --standalone --user-id
  {user_id}`.
- `package.json` carries `"mcpName": "io.github.hjqcan/goodmemory"`, which the
  registry matches against `server.json`'s `name` to prove the npm package maps
  to this server. `tests/unit/mcp-registry-manifest.test.ts` keeps the two names
  and all versions in lockstep with `package.json`.

## Prerequisites

1. The npm package is published at the same version as `server.json`
   (`npm view goodmemory version` must equal `server.json` → `version`). Publish
   npm first if you just bumped.
2. You can authenticate as the GitHub account `hjqcan` — the `io.github.hjqcan/*`
   namespace is owned by proving control of that GitHub account.

## Steps

1. Install the publisher CLI (Homebrew or a prebuilt binary from the
   [registry releases](https://github.com/modelcontextprotocol/registry/releases)):

   ```bash
   brew install mcp-publisher
   mcp-publisher --help   # init, login, logout, publish
   ```

2. Authenticate for the GitHub namespace (opens a browser device-authorization
   flow):

   ```bash
   mcp-publisher login github
   ```

   Add any generated token files to `.gitignore`; do not commit them.

3. From the repo root (where `server.json` lives), publish:

   ```bash
   mcp-publisher publish
   ```

4. Verify the listing resolves:

   ```bash
   curl -fsS "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.hjqcan/goodmemory"
   ```

## When you bump the version

Update the version in **three** places, then republish npm and the registry:

- `package.json` → `version`
- `server.json` → top-level `version` **and** `packages[0].version`

The manifest test fails loudly if any of these drift from `package.json`, and
[`.well-known/goodmemory.json`](../.well-known/goodmemory.json) must be
regenerated (`bun run scripts/generate-capability-descriptor.ts`) so the
capability descriptor's version-pinned install commands stay correct.
