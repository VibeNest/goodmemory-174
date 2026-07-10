#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BUN_BINARY = process.env.GOODMEMORY_BUN_BINARY ?? "bun";
const CLI_ENTRYPOINT = resolve(SCRIPT_DIR, "../dist/bin/goodmemory-cli.js");
const PACKAGE_JSON = resolve(SCRIPT_DIR, "../package.json");

function versionRequested(args) {
  return args.includes("-V") || args.includes("--version");
}

if (versionRequested(process.argv.slice(2))) {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  console.log(`goodmemory ${packageJson.version}`);
  process.exit(0);
}

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
