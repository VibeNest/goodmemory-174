import { describe, expect, it } from "bun:test";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import * as reporting from "../../src/eval/reporting";

const SRC_ROOT = join(import.meta.dir, "../../src");
const STORAGE_IMPLEMENTATION_FILES = new Set([
  "storage/memory.ts",
  "storage/postgres.ts",
  "storage/repositories.ts",
  "storage/sqlite.ts",
]);
const STORAGE_PORTS_FILE = "storage/ports.ts";
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

async function collectImportedBindingsForTarget(
  file: string,
  targetPath: string,
): Promise<string[]> {
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }

    const specifier = moduleSpecifier.text;
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      continue;
    }

    const resolvedTarget = await resolveInternalImport(file, specifier);
    if (resolvedTarget !== targetPath) {
      continue;
    }

    const importClause = statement.importClause;
    if (!importClause?.namedBindings || !ts.isNamedImports(importClause.namedBindings)) {
      continue;
    }

    for (const element of importClause.namedBindings.elements) {
      bindings.add(element.propertyName?.text ?? element.name.text);
    }
  }

  return [...bindings];
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

function allowedStoragePortBindings(relativePath: string): Set<string> {
  const normalizedPath = normalizeInternalPath(relativePath);

  if (normalizedPath.startsWith("remember/")) {
    return new Set([
      "RememberRepositoryPort",
      "RememberVectorPort",
    ]);
  }

  if (normalizedPath.startsWith("recall/")) {
    return new Set([
      "RecallRepositoryPort",
      "RecallRuntimePort",
      "RecallVectorSearchPort",
    ]);
  }

  if (normalizedPath.startsWith("maintenance/")) {
    return new Set([
      "MaintenanceRepositoryPort",
      "MaintenanceVectorPort",
    ]);
  }

  if (normalizedPath.startsWith("evolution/")) {
    return new Set([
      "EvolutionRepositoryPort",
    ]);
  }

  return new Set();
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

  it("keeps raw repository and engine assembly out of the root public barrel", async () => {
    const source = await readFile(join(SRC_ROOT, "index.ts"), "utf8");

    expect(source).not.toContain('export { createMemoryRepositories } from "./storage/repositories"');
    expect(source).not.toContain('export { createRecallEngine } from "./recall/engine"');
    expect(source).not.toContain('export { createRememberEngine } from "./remember/engine"');
    expect(source).not.toContain("MemoryRepositoriesConfig");
    expect(source).not.toContain("RecallEngineConfig");
    expect(source).not.toContain("InternalRecallResult");
  });

  it("keeps createGoodMemory composed from narrow governance ports instead of MemoryRepositories typing", async () => {
    const source = await readFile(
      join(SRC_ROOT, "api", "createGoodMemory.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/\bMemoryRepositories\b/);
    expect(source).toContain("GovernanceRepositoryPort");
    expect(source).toContain("createEvolutionRuntime");
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

  it("keeps subsystem ports scoped to their owning core behavior directories", async () => {
    const files = await collectTypeScriptFiles(SRC_ROOT);
    const offenders: Array<{ file: string; bindings: string[] }> = [];

    for (const file of files) {
      const relativePath = toSourceRelativePath(file);
      if (!isCoreBehaviorFile(relativePath)) {
        continue;
      }

      const importedBindings = await collectImportedBindingsForTarget(
        file,
        STORAGE_PORTS_FILE,
      );
      const allowedBindings = allowedStoragePortBindings(relativePath);
      const disallowedBindings = importedBindings.filter(
        (binding) => !allowedBindings.has(binding),
      );

      if (disallowedBindings.length > 0) {
        offenders.push({
          file: relativePath,
          bindings: disallowedBindings,
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  it("limits storage repository wiring to composition and public compatibility layers", async () => {
    const files = await collectTypeScriptFiles(SRC_ROOT);
    const allowedFiles = new Set([
      "api/createGoodMemory.ts",
      "index.ts",
      "storage/repositories.ts",
    ]);
    const offenders: Array<{ file: string; targets: string[] }> = [];

    for (const file of files) {
      const relativePath = toSourceRelativePath(file);
      if (allowedFiles.has(relativePath)) {
        continue;
      }

      const targets = await collectInternalImportEdges(file);
      const disallowedTargets = targets.filter(
        (target) => target === "storage/repositories.ts",
      );

      if (disallowedTargets.length > 0) {
        offenders.push({
          file: relativePath,
          targets: disallowedTargets,
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  it("removes the legacy llm directory and blocks any internal reintroduction", async () => {
    const files = await collectTypeScriptFiles(SRC_ROOT);
    const offenders: Array<{ file: string; targets: string[] }> = [];

    for (const file of files) {
      const relativePath = toSourceRelativePath(file);
      const targets = await collectInternalImportEdges(file);
      const disallowedTargets = targets.filter((target) =>
        target.startsWith("llm/"),
      );

      if (disallowedTargets.length > 0) {
        offenders.push({
          file: relativePath,
          targets: disallowedTargets,
        });
      }
    }

    expect(offenders).toEqual([]);
    expect(await fileExists(join(SRC_ROOT, "llm", "ai-sdk-runtime.ts"))).toBe(false);
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

  it("keeps the AI SDK adapter on the runtime-kit lifecycle instead of a duplicate memory loop", async () => {
    const source = await readFile(join(SRC_ROOT, "ai-sdk", "public.ts"), "utf8");

    expect(source).toContain("createGoodMemoryRuntimeKit");
    expect(source).not.toContain("config.memory.recall");
    expect(source).not.toContain("config.memory.buildContext");
    expect(source).not.toContain("config.memory.remember");
    expect(source).not.toContain("input.memory.recall");
    expect(source).not.toContain("input.memory.buildContext");
    expect(source).not.toContain("input.memory.remember");
  });

  it("keeps recall selection split into orchestration plus bounded selector modules", async () => {
    const selectionSource = await readFile(
      join(SRC_ROOT, "recall", "selection.ts"),
      "utf8",
    );
    const selectorFiles = await collectTypeScriptFiles(
      join(SRC_ROOT, "recall", "selectors"),
    );
    const oversizedSelectorFiles: Array<{ file: string; lines: number }> = [];
    const wildcardBarrels: string[] = [];

    expect(selectionSource.split("\n").length).toBeLessThanOrEqual(1200);
    expect(
      await fileExists(join(SRC_ROOT, "recall", "selectors", "factSelection.ts")),
    ).toBe(false);
    expect(
      await fileExists(join(SRC_ROOT, "recall", "selectors", "sourceOrder.ts")),
    ).toBe(false);

    for (const file of selectorFiles) {
      const source = await readFile(file, "utf8");
      const lines = source.split("\n").length;

      if (lines > 1200) {
        oversizedSelectorFiles.push({
          file: toSourceRelativePath(file),
          lines,
        });
      }
      if (/export\s+\*\s+from/u.test(source)) {
        wildcardBarrels.push(toSourceRelativePath(file));
      }
    }

    expect(oversizedSelectorFiles).toEqual([]);
    expect(wildcardBarrels).toEqual([]);
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
