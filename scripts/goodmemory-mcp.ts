#!/usr/bin/env bun
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveGoodMemoryMcp } from "../src/install/hostMcpServer";
import {
  ensureStandaloneStorageReady,
  resolveInstalledHostMcpAllowWrite,
  resolveMcpServeOptions,
} from "../src/install/standaloneMcpContext";

async function main(): Promise<void> {
  const options = resolveMcpServeOptions({
    argv: process.argv.slice(2),
    env: process.env,
  });

  if (options.mode === "error") {
    // stderr only: stdout is the MCP stdio transport channel and must stay
    // clean for the connecting client.
    process.stderr.write(`${options.message}\n`);
    process.exit(1);
  }

  if (options.mode === "standalone") {
    ensureStandaloneStorageReady(options.config);
    await serveGoodMemoryMcp({
      allowWrite: options.allowWrite,
      standalone: options.config,
    });
    return;
  }

  await serveGoodMemoryMcp({
    // The managed registration args never carry --allow-write (repair would
    // rewrite them); installed hosts opt in via mcp.allowWrite in the host
    // config, read once at server start.
    allowWrite:
      options.allowWrite ||
      (await resolveInstalledHostMcpAllowWrite({ host: options.host })),
    host: options.host,
  });
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
