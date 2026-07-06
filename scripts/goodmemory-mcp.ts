#!/usr/bin/env bun
import { serveGoodMemoryMcp } from "../src/install/hostMcpServer";
import {
  ensureStandaloneStorageReady,
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
    allowWrite: options.allowWrite,
    host: options.host,
  });
}

if (import.meta.main) {
  await main();
}
