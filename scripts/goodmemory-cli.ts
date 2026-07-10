#!/usr/bin/env bun
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCLI } from "../src/cli";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const result = await runCLI(args);

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  if (args[0] === "mcp" && args[1] === "serve") {
    process.exitCode = result.exitCode;
    return;
  }

  if (
    args[0] === "runtime" &&
    args[1] === "viewer" &&
    !args.includes("--dry-run") &&
    result.exitCode === 0
  ) {
    process.exitCode = result.exitCode;
    return;
  }

  if (
    args[0] === "inspector" &&
    (args[1] === "serve" || args[1] === undefined) &&
    !args.includes("--dry-run") &&
    result.exitCode === 0
  ) {
    process.exitCode = result.exitCode;
    return;
  }

  process.exit(result.exitCode);
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
