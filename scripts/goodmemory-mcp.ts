#!/usr/bin/env bun
import { serveGoodMemoryMcp } from "../src/install/hostMcpServer";

function parseHost(argv: string[]): "claude" | "codex" {
  const hostFlagIndex = argv.findIndex((token) => token === "--host");
  const hostValue =
    hostFlagIndex >= 0 ? argv[hostFlagIndex + 1] : undefined;

  if (hostValue === "claude" || hostValue === "codex") {
    return hostValue;
  }

  throw new Error("Missing required flag --host <codex|claude>.");
}

async function main(): Promise<void> {
  await serveGoodMemoryMcp({
    host: parseHost(process.argv.slice(2)),
  });
}

if (import.meta.main) {
  await main();
}
