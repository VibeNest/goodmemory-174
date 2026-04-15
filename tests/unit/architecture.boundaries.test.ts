import { describe, expect, it } from "bun:test";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import * as reporting from "../../src/eval/reporting";

const SRC_ROOT = join(import.meta.dir, "../../src");
const STORAGE_IMPLEMENTATION_FILES = new Set([
  "storage/memory.ts",
  "storage/postgres.ts",
  "storage/sqlite.ts",
]);
const CORE_CONTRACT_FILES = new Set([
  "embedding/contracts.ts",
  "evidence/contracts.ts",
  "evolution/contracts.ts",
  "storage/contracts.ts",
]);

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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeInternalPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function toSourceRelativePath(path: string): string {
  return normalizeInternalPath(relative(SRC_ROOT, path));
}

function collectRelativeModuleSpecifiers(source: string): string[] {
  const moduleReferences = ts.preProcessFile(source, true, true).importedFiles;
  const specifiers = new Set<string>();

  for (const { fileName } of moduleReferences) {
    if (fileName.startsWith("./") || fileName.startsWith("../")) {
      specifiers.add(fileName);
    }
  }

  return [...specifiers];
}

async function resolveInternalImport(
  file: string,
  specifier: string,
): Promise<string | null> {
  const targetBase = resolve(dirname(file), specifier);
  const candidates = [
    `${targetBase}.ts`,
    join(targetBase, "index.ts"),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return toSourceRelativePath(candidate);
    }
  }

  return null;
}

async function collectInternalImportEdges(file: string): Promise<string[]> {
  const source = await readFile(file, "utf8");
  const targets = new Set<string>();

  for (const specifier of collectRelativeModuleSpecifiers(source)) {
    const target = await resolveInternalImport(file, specifier);
    if (target) {
      targets.add(target);
    }
  }

  return [...targets];
}

function isCoreContractFile(relativePath: string): boolean {
  const normalizedPath = normalizeInternalPath(relativePath);
  return (
    normalizedPath.startsWith("domain/") ||
    CORE_CONTRACT_FILES.has(normalizedPath)
  );
}

function isCoreBehaviorFile(relativePath: string): boolean {
  const normalizedPath = normalizeInternalPath(relativePath);
  return (
    normalizedPath.startsWith("governance/") ||
    normalizedPath.startsWith("maintenance/") ||
    normalizedPath.startsWith("recall/") ||
    normalizedPath.startsWith("remember/") ||
    normalizedPath.startsWith("runtime/") ||
    normalizedPath.startsWith("verify/") ||
    (
      normalizedPath.startsWith("evolution/") &&
      normalizedPath !== "evolution/contracts.ts"
    )
  );
}

describe("architecture boundaries", () => {
  it("treats re-exports as internal dependency edges", async () => {
    expect(
      await collectInternalImportEdges(join(SRC_ROOT, "language", "index.ts")),
    ).toEqual([
      "language/contracts.ts",
      "language/chinese.ts",
      "language/english.ts",
      "language/generic.ts",
      "language/service.ts",
    ]);
  });

  it("normalizes internal paths before boundary checks", () => {
    expect(isCoreContractFile("domain\\record.ts")).toBe(true);
    expect(isCoreBehaviorFile("remember\\engine.ts")).toBe(true);
  });

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
        offenders.push(toSourceRelativePath(file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps core contracts isolated from api, eval, adapters, and storage implementations", async () => {
    const files = await collectTypeScriptFiles(SRC_ROOT);
    const offenders: Array<{ file: string; targets: string[] }> = [];

    for (const file of files) {
      const relativePath = toSourceRelativePath(file);
      if (!isCoreContractFile(relativePath)) {
        continue;
      }

      const targets = await collectInternalImportEdges(file);
      const disallowedTargets = targets.filter((target) => {
        return (
          target === "cli.ts" ||
          target.startsWith("api/") ||
          target.startsWith("eval/") ||
          target.startsWith("llm/") ||
          target.startsWith("provider/") ||
          (target.startsWith("storage/") && target !== "storage/contracts.ts")
        );
      });

      if (disallowedTargets.length > 0) {
        offenders.push({
          file: relativePath,
          targets: disallowedTargets,
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps core behavior isolated from api, eval, adapters, and storage implementations", async () => {
    const files = await collectTypeScriptFiles(SRC_ROOT);
    const offenders: Array<{ file: string; targets: string[] }> = [];

    for (const file of files) {
      const relativePath = toSourceRelativePath(file);
      if (!isCoreBehaviorFile(relativePath)) {
        continue;
      }

      const targets = await collectInternalImportEdges(file);
      const disallowedTargets = targets.filter((target) => {
        return (
          target === "cli.ts" ||
          target.startsWith("api/") ||
          target.startsWith("eval/") ||
          target.startsWith("llm/") ||
          target.startsWith("provider/") ||
          STORAGE_IMPLEMENTATION_FILES.has(target)
        );
      });

      if (disallowedTargets.length > 0) {
        offenders.push({
          file: relativePath,
          targets: disallowedTargets,
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps provider-backed memory extraction outside the remember directory", async () => {
    expect(
      await fileExists(join(SRC_ROOT, "remember/llm-extractor.ts")),
    ).toBe(false);

    const providerLayerSource = await readFile(
      join(SRC_ROOT, "provider/layer.ts"),
      "utf8",
    );

    expect(providerLayerSource).toContain('from "./memory-extractor"');
    expect(providerLayerSource).not.toContain("../remember/llm-extractor");
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
