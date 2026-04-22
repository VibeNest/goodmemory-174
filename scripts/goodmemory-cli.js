#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BUN_BINARY = process.env.GOODMEMORY_BUN_BINARY ?? "bun";
const CLI_ENTRYPOINT = resolve(SCRIPT_DIR, "./goodmemory-cli.ts");

const result = spawnSync(BUN_BINARY, ["run", CLI_ENTRYPOINT, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  if ("code" in result.error && result.error.code === "ENOENT") {
    console.error(
      [
        "GoodMemory CLI currently requires Bun.",
        "Install Bun or set GOODMEMORY_BUN_BINARY to a Bun executable before running `goodmemory`.",
      ].join(" "),
    );
    process.exit(1);
  }

  throw result.error;
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
