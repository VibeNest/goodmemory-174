import { describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import * as reporting from "../../src/eval/reporting";

const SRC_ROOT = join(import.meta.dir, "../../src");

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("architecture boundaries", () => {
  it("disallows src internals from importing the public barrel", async () => {
    const files = await collectTypeScriptFiles(SRC_ROOT);
    const offenders: string[] = [];
    const relativeIndexImportPattern = /from\s+["'](?:\.\.?\/)+index(?:\.ts)?["']/;
    const absoluteIndexImportPattern = /from\s+["'][^"']*src\/index(?:\.ts)?["']/;

    for (const file of files) {
      if (file === join(SRC_ROOT, "index.ts")) {
        continue;
      }

      const source = await readFile(file, "utf8");
      if (
        relativeIndexImportPattern.test(source) ||
        absoluteIndexImportPattern.test(source)
      ) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps eval reporting limited to function exports", async () => {
    expect(Object.keys(reporting).sort()).toEqual([
      "aggregateJudgedCases",
      "persistEvalArtifacts",
    ]);

    const source = await readFile(join(SRC_ROOT, "eval/reporting.ts"), "utf8");
    expect(source).not.toMatch(/export\s+(interface|type)\s+/);
  });
});
