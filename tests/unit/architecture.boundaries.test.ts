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
const RECALL_SELECTION_MAX_LINES = 300;
const RECALL_SELECTOR_MAX_LINES = 900;
const RECALL_FACT_SELECTION_MAX_LINES = 350;
const RECALL_FACT_SELECTION_FILE_LIMIT = 14;
const RECALL_SELECTOR_TOP_LEVEL_FILE_LIMIT = 35;
const SOURCE_ORDER_SELECTOR_TOP_LEVEL_FILE_LIMIT = 25;
const ALLOWED_RECALL_SELECTION_QUERY_IMPORTS = new Set([
  "selectContradictionEvidencePair",
  "resolveContradictionSelection",
  "selectSourceOrderedInformationExtractionEvidence",
  "selectSourceOrderedInstructionEvidence",
  "selectSourceOrderedPreferenceEvidence",
  "selectSourceOrderedReasoningBridgeEvidence",
  "selectSourceOrderedSummaryCoverage",
  "selectSourceOrderedTemporalIntervalEvidence",
  "selectSourceOrderedTimelineIntegrationEvidence",
]);
const DISALLOWED_SELECTOR_FILENAME_PATTERN =
  /(?:Alexis|Greg|Kimberly|Stephen|FlaskLogin|WeatherAutocomplete|AiHiring|Sneaker)/u;
const DISALLOWED_SELECTOR_RUNTIME_FIXTURE_PATTERN =
  /\b(?:ashlee|bay-street|bay\s+street|laura|mason|michael|michele|patrick|robert|stephanie|thomas)\b/iu;

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

async function collectTopLevelTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(directory, entry.name));
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
    const selectorDirectory = join(SRC_ROOT, "recall", "selectors");
    const selectionSource = await readFile(
      join(SRC_ROOT, "recall", "selection.ts"),
      "utf8",
    );
    const selectorFiles = await collectTypeScriptFiles(selectorDirectory);
    const topLevelSelectorFiles = await collectTopLevelTypeScriptFiles(selectorDirectory);
    const topLevelSourceOrderSelectorFiles = topLevelSelectorFiles.filter((file) =>
      file.split("/").at(-1)?.startsWith("sourceOrder") === true
    );
    const oversizedSelectorFiles: Array<{ file: string; lines: number }> = [];
    const wildcardBarrels: string[] = [];
    const benchmarkLiteralFiles: Array<{ file: string; literal: string }> = [];
    const caseNamedSelectorFiles: string[] = [];
    const caseLiteralSelectorFiles: string[] = [];
    const disallowedSelectionQueryImports: string[] = [];

    expect(selectionSource.split("\n").length).toBeLessThanOrEqual(
      RECALL_SELECTION_MAX_LINES,
    );
    expect(
      await fileExists(join(SRC_ROOT, "recall", "selectors", "factSelection.ts")),
    ).toBe(false);
    expect(
      await fileExists(join(SRC_ROOT, "recall", "selectors", "sourceOrder.ts")),
    ).toBe(false);
    expect(topLevelSelectorFiles.length).toBeLessThanOrEqual(
      RECALL_SELECTOR_TOP_LEVEL_FILE_LIMIT,
    );
    expect(topLevelSourceOrderSelectorFiles.length).toBeLessThanOrEqual(
      SOURCE_ORDER_SELECTOR_TOP_LEVEL_FILE_LIMIT,
    );

    for (const binding of await collectImportedBindingsForTarget(
      join(SRC_ROOT, "recall", "selection.ts"),
      "recall/selectors/contradiction.ts",
    )) {
      if (
        /^is[A-Z].*Query$/u.test(binding) &&
        !ALLOWED_RECALL_SELECTION_QUERY_IMPORTS.has(binding)
      ) {
        disallowedSelectionQueryImports.push(binding);
      }
    }

    const selectionSourceFile = ts.createSourceFile(
      "selection.ts",
      selectionSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of selectionSourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }

      const moduleSpecifier = statement.moduleSpecifier;
      if (
        !ts.isStringLiteral(moduleSpecifier) ||
        !moduleSpecifier.text.startsWith("./selectors/")
      ) {
        continue;
      }

      const importClause = statement.importClause;
      if (!importClause?.namedBindings || !ts.isNamedImports(importClause.namedBindings)) {
        continue;
      }

      for (const element of importClause.namedBindings.elements) {
        const binding = element.propertyName?.text ?? element.name.text;
        if (
          /^is[A-Z].*Query$/u.test(binding) &&
          !ALLOWED_RECALL_SELECTION_QUERY_IMPORTS.has(binding)
        ) {
          disallowedSelectionQueryImports.push(binding);
        }
      }
    }

    for (const file of selectorFiles) {
      const source = await readFile(file, "utf8");
      const lines = source.split("\n").length;
      const relativePath = toSourceRelativePath(file);

      if (lines > RECALL_SELECTOR_MAX_LINES) {
        oversizedSelectorFiles.push({
          file: relativePath,
          lines,
        });
      }
      if (/export\s+\*\s+from/u.test(source)) {
        wildcardBarrels.push(relativePath);
      }
      if (
        relativePath !== "recall/selectors/sourceEnvelope.ts" &&
        /\b(?:external_benchmark|BEAM)\b/u.test(source)
      ) {
        benchmarkLiteralFiles.push({
          file: relativePath,
          literal: source.includes("external_benchmark")
            ? "external_benchmark"
            : "BEAM",
        });
      }
      if (DISALLOWED_SELECTOR_FILENAME_PATTERN.test(relativePath)) {
        caseNamedSelectorFiles.push(relativePath);
      }
      if (
        relativePath !== "recall/selectors/sourceEnvelope.ts" &&
        DISALLOWED_SELECTOR_RUNTIME_FIXTURE_PATTERN.test(source)
      ) {
        caseLiteralSelectorFiles.push(relativePath);
      }
    }

    expect(selectionSource).not.toMatch(/\b(?:external_benchmark|BEAM)\b/u);
    expect([...new Set(disallowedSelectionQueryImports)].sort()).toEqual([]);
    expect(oversizedSelectorFiles).toEqual([]);
    expect(wildcardBarrels).toEqual([]);
    expect(benchmarkLiteralFiles).toEqual([]);
    expect(caseNamedSelectorFiles).toEqual([]);
    expect(caseLiteralSelectorFiles).toEqual([]);

    for (const reExport of [
      "selectArchives",
      "selectEpisodes",
      "selectFeedback",
      "selectFeedbackForProfile",
      "selectFeedbackForQuery",
      "selectPreferencesForQuery",
      "selectReferences",
    ]) {
      expect(selectionSource).toContain(reExport);
    }
  });

  it("keeps fact-selection orchestration modules bounded and mutation-owned", async () => {
    const factSelectionDirectory = join(SRC_ROOT, "recall", "factSelection");
    if (!(await fileExists(factSelectionDirectory))) {
      // Rules activate once the factSelection extraction lands.
      return;
    }

    const factSelectionFiles = await collectTypeScriptFiles(factSelectionDirectory);
    const selectionSource = await readFile(
      join(SRC_ROOT, "recall", "selection.ts"),
      "utf8",
    );
    const oversizedFiles: Array<{ file: string; lines: number }> = [];
    const wildcardBarrels: string[] = [];
    const benchmarkLiteralFiles: string[] = [];
    const fixtureLiteralFiles: string[] = [];
    const disallowedQueryImports: string[] = [];
    const unauthorizedDraftMutations: string[] = [];
    const draftMutationPattern =
      /\bselected\s*\.\s*(?:push|splice)\s*\(|\bselectedIds\s*\.\s*(?:add|delete)\s*\(/u;

    expect(factSelectionFiles.length).toBeLessThanOrEqual(
      RECALL_FACT_SELECTION_FILE_LIMIT,
    );

    for (const file of factSelectionFiles) {
      const source = await readFile(file, "utf8");
      const relativePath = toSourceRelativePath(file);
      const lines = source.split("\n").length;
      if (lines > RECALL_FACT_SELECTION_MAX_LINES) {
        oversizedFiles.push({ file: relativePath, lines });
      }
      if (/export\s+\*\s+from/u.test(source)) {
        wildcardBarrels.push(relativePath);
      }
      if (/\b(?:external_benchmark|BEAM)\b/u.test(source)) {
        benchmarkLiteralFiles.push(relativePath);
      }
      if (DISALLOWED_SELECTOR_RUNTIME_FIXTURE_PATTERN.test(source)) {
        fixtureLiteralFiles.push(relativePath);
      }

      const isDraftModule = relativePath === "recall/factSelection/draft.ts";
      if (!isDraftModule) {
        if (draftMutationPattern.test(source)) {
          unauthorizedDraftMutations.push(relativePath);
        }
        if (/\bmarkSelectedTrace\b/u.test(source)) {
          unauthorizedDraftMutations.push(`${relativePath} (markSelectedTrace)`);
        }
      }

      const sourceFile = ts.createSourceFile(
        relativePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) {
          continue;
        }
        const moduleSpecifier = statement.moduleSpecifier;
        if (!ts.isStringLiteral(moduleSpecifier) || !moduleSpecifier.text.startsWith(".")) {
          continue;
        }
        const importClause = statement.importClause;
        if (!importClause?.namedBindings || !ts.isNamedImports(importClause.namedBindings)) {
          continue;
        }
        for (const element of importClause.namedBindings.elements) {
          const binding = element.propertyName?.text ?? element.name.text;
          if (
            /^is[A-Z].*Query$/u.test(binding) &&
            !ALLOWED_RECALL_SELECTION_QUERY_IMPORTS.has(binding)
          ) {
            disallowedQueryImports.push(`${relativePath}: ${binding}`);
          }
        }
      }
    }

    // Once the draft module owns selection-state mutation, the engine itself
    // must route every mutation through it.
    expect(selectionSource).not.toMatch(draftMutationPattern);
    expect(selectionSource).not.toMatch(/\bmarkSelectedTrace\b/u);

    // The engine is a small declarative loop: route bodies live in the route
    // modules, never as inline switch cases.
    expect(selectionSource).not.toMatch(/\bswitch\s*\(/u);

    // The post-primary override pipeline must stay declarative: pruning lives
    // in the augmenter stages, never inline in the engine.
    const augmenterTablePath = join(
      factSelectionDirectory,
      "augmenterTable.ts",
    );
    if (await fileExists(augmenterTablePath)) {
      expect(selectionSource).not.toContain(
        "pruneSourceInstructionNoiseSelections",
      );
      const { FACT_SELECTION_AUGMENTER_TABLE } = await import(
        "../../src/recall/factSelection/augmenterTable"
      );
      expect(
        FACT_SELECTION_AUGMENTER_TABLE.map((stage: { id: string }) => stage.id),
      ).toEqual([
        "instruction_and_source_preference",
        "assistant_count_headings",
        "direct_factual_companions",
        "coupon_store_companions",
      ]);
      const pruningStages = FACT_SELECTION_AUGMENTER_TABLE.filter(
        (stage: { canPrune: boolean }) => stage.canPrune,
      ).map((stage: { id: string }) => stage.id);
      expect(pruningStages).toEqual(["instruction_and_source_preference"]);
    }

    expect(oversizedFiles).toEqual([]);
    expect(wildcardBarrels).toEqual([]);
    expect(benchmarkLiteralFiles).toEqual([]);
    expect(fixtureLiteralFiles).toEqual([]);
    expect(disallowedQueryImports).toEqual([]);
    expect(unauthorizedDraftMutations).toEqual([]);
  });

  it("keeps the narrow-gate registry as the only recall environment seam", async () => {
    const narrowGatesPath = join(SRC_ROOT, "recall", "narrowGates.ts");
    if (!(await fileExists(narrowGatesPath))) {
      return;
    }

    const narrowGatesSource = await readFile(narrowGatesPath, "utf8");
    expect(narrowGatesSource.split("\n").length).toBeLessThanOrEqual(200);

    const recallFiles = await collectTypeScriptFiles(join(SRC_ROOT, "recall"));
    const envReaders: string[] = [];
    for (const file of recallFiles) {
      const relativePath = toSourceRelativePath(file);
      if (relativePath === "recall/narrowGates.ts") {
        continue;
      }
      const source = await readFile(file, "utf8");
      if (/\bprocess\.env\b/u.test(source)) {
        envReaders.push(relativePath);
      }
    }
    expect(envReaders).toEqual([]);
  });

  it("keeps eval reporting limited to function exports", async () => {
    expect(Object.keys(reporting).sort()).toEqual([
      "aggregateJudgedCases",
      "persistEvalArtifacts",
    ]);

    const source = await readFile(join(SRC_ROOT, "eval/reporting.ts"), "utf8");
    expect(source).not.toMatch(/export\s+(interface|type)\s+/);
  });

  it("keeps the provider layer free of eval harness imports", async () => {
    const files = await collectTypeScriptFiles(join(SRC_ROOT, "provider"));
    const offenders: Array<{ file: string; targets: string[] }> = [];

    for (const file of files) {
      const targets = await collectInternalImportEdges(file);
      const disallowedTargets = targets.filter((target) =>
        target.startsWith("eval/"),
      );

      if (disallowedTargets.length > 0) {
        offenders.push({
          file: toSourceRelativePath(file),
          targets: disallowedTargets,
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
