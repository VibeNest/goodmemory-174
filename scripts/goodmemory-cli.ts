#!/usr/bin/env bun
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

if (import.meta.main) {
  await main();
}
