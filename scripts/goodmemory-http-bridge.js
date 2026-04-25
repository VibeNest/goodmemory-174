#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BUN_BINARY = process.env.GOODMEMORY_BUN_BINARY ?? "bun";
const HTTP_BRIDGE_ENTRYPOINT = resolve(
  SCRIPT_DIR,
  "./goodmemory-http-bridge.ts",
);

const child = spawn(
  BUN_BINARY,
  ["run", HTTP_BRIDGE_ENTRYPOINT, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("error", (error) => {
  if ("code" in error && error.code === "ENOENT") {
    console.error(
      [
        "GoodMemory HTTP bridge currently requires Bun.",
        "Install Bun or set GOODMEMORY_BUN_BINARY to a Bun executable before running `goodmemory-http-bridge`.",
      ].join(" "),
    );
    process.exit(1);
  }

  throw error;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
