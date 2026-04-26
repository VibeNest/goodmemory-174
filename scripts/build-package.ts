#!/usr/bin/env bun
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DIST_DIR = join(REPO_ROOT, "dist");

await rm(DIST_DIR, { recursive: true, force: true });
await mkdir(DIST_DIR, { recursive: true });

const result = await Bun.build({
  entrypoints: [
    join(REPO_ROOT, "src/index.ts"),
    join(REPO_ROOT, "src/ai-sdk/index.ts"),
    join(REPO_ROOT, "src/host/index.ts"),
    join(REPO_ROOT, "src/http/index.ts"),
    join(REPO_ROOT, "src/runtime-kit/index.ts"),
  ],
  external: ["bun", "bun:sqlite"],
  format: "esm",
  naming: "[dir]/[name].js",
  outdir: DIST_DIR,
  splitting: true,
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  process.exit(1);
}
