import { describe, expect, it } from "bun:test";
import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const QUALITY_GATE_ARCHIVE_ROOT = "docs/archive/quality-gates";
const CANONICAL_PHASE20_DEPENDENCY_SUMMARY_ARTIFACTS = [
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-16/run-20260420023503-phase-16/public-surface-decision.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-16/run-20260420023503-phase-16/regression-dashboard.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-16/run-20260420023503-phase-16/report.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-16/run-20260420023503-phase-16/shadow-comparisons.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-16/run-20260420023503-phase-16/shadow-executed-path-comparisons.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-16/run-20260420023503-phase-16/strategy-promotion-gate.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-17/run-20260420023503-phase-17/public-surface-decision.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-17/run-20260420023503-phase-17/regression-dashboard.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-17/run-20260420023503-phase-17/report.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-17/run-20260420023503-phase-17/shadow-comparisons.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-17/run-20260420023503-phase-17/shadow-executed-path-comparisons.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-17/run-20260420023503-phase-17/strategy-promotion-gate.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-18/run-20260420023503-phase-18/phase-18-quality-gate.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-19-maintenance/run-20260420023503-phase-19-maintenance/phase-19-maintenance-quality-gate.json",
  "reports/quality-gates/phase-20/run-20260420023503/dependency-gates/phase-19-reviewer/run-20260420023503-phase-19-reviewer/phase-19-reviewer-quality-gate.json",
] as const;

async function runGitCommand(args: string[]): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const process = Bun.spawn({
    cmd: ["git", ...args],
    cwd: join(import.meta.dir, "../../"),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(process.stdout).text();
  const stderr = await new Response(process.stderr).text();
  const exitCode = await process.exited;

  return {
    exitCode,
    stderr,
    stdout,
  };
}

function createChildEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return env;
}

async function runCommand(input: {
  cmd: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
}): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const childProcess = Bun.spawn({
    cmd: input.cmd,
    cwd: input.cwd,
    env: createChildEnv(input.env),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(childProcess.stdout).text();
  const stderr = await new Response(childProcess.stderr).text();
  const exitCode = await childProcess.exited;

  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function expectGitTrackedRepoArtifact(relativePath: string) {
  await access(join(import.meta.dir, "../../", relativePath));

  const tracked = await runGitCommand([
    "ls-files",
    "--error-unmatch",
    relativePath,
  ]);
  expect(tracked.exitCode).toBe(0);
  expect(tracked.stdout.trim()).toBe(relativePath);

  const ignored = await runGitCommand([
    "check-ignore",
    "-v",
    "--no-index",
    relativePath,
  ]);
  expect(ignored.exitCode).toBe(0);
  expect(ignored.stdout).toContain("\t" + relativePath);
  expect(ignored.stdout).toContain("!");
}

async function expectTrackedEvalReportsMentionedInFile(relativePath: string) {
  const content = await readFile(
    join(import.meta.dir, "../../", relativePath),
    "utf8",
  );
  const reportPaths = [
    ...new Set(
      [...content.matchAll(/reports\/eval\/[^\s`]+\/report\.json/g)].map(
        (match) => match[0],
      ),
    ),
  ];

  expect(reportPaths.length).toBeGreaterThan(0);

  for (const reportPath of reportPaths) {
    await expectGitTrackedRepoArtifact(reportPath);
  }
}

async function expectCanonicalAcceptedQualityGate(input: {
  docPath: string;
  phaseDirectory: string;
  reportFileName: string;
  runId: string;
}) {
  const qualityGateDoc = await readFile(
    join(import.meta.dir, "../../", input.docPath),
    "utf8",
  );
  const referencedRunIds = [
    ...qualityGateDoc.matchAll(/run-\d{14}/g),
  ].map((match) => match[0]);

  expect(referencedRunIds.length).toBeGreaterThan(0);
  expect(new Set(referencedRunIds)).toEqual(new Set([input.runId]));

  const [canonicalRunId] = referencedRunIds;
  const relativeReportPath = `reports/quality-gates/${input.phaseDirectory}/${canonicalRunId}/${input.reportFileName}`;
  const report = JSON.parse(
    await readFile(
      join(
        import.meta.dir,
        `../../${relativeReportPath}`,
      ),
      "utf8",
    ),
  ) as {
    acceptance: {
      decision: string;
    };
    runId: string;
  };

  expect(report.runId).toBe(canonicalRunId);
  expect(report.acceptance.decision).toBe("accepted");

  const tracked = await runGitCommand([
    "ls-files",
    "--error-unmatch",
    relativeReportPath,
  ]);
  expect(tracked.exitCode).toBe(0);
  expect(tracked.stdout.trim()).toBe(relativeReportPath);

  const ignored = await runGitCommand([
    "check-ignore",
    "-v",
    "--no-index",
    relativeReportPath,
  ]);
  expect(ignored.exitCode).toBe(0);
  expect(ignored.stdout).toContain(
    "!reports/quality-gates/*/run-*/phase-*-quality-gate.json",
  );

  const reportRoot = join(
    import.meta.dir,
    "../../reports/quality-gates",
    input.phaseDirectory,
  );
  const entries = await readdir(reportRoot, { withFileTypes: true });
  const acceptedRunIds: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) {
      continue;
    }

    const candidateReportContent = await readFile(
      join(reportRoot, entry.name, input.reportFileName),
      "utf8",
    ).catch(() => undefined);
    if (!candidateReportContent) {
      continue;
    }

    const candidateReport = JSON.parse(candidateReportContent) as {
      acceptance: {
        decision: string;
      };
      runId: string;
    };

    if (candidateReport.acceptance.decision === "accepted") {
      acceptedRunIds.push(candidateReport.runId);
    }
  }

  expect(new Set(acceptedRunIds)).toEqual(new Set([input.runId]));
}

describe("release metadata and docs", () => {
  it("package metadata exposes bin, exports, and key scripts", async () => {
    const pkg = JSON.parse(
      await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
    ) as {
      bin?: Record<string, string>;
      exports?: Record<string, string | { import?: string }>;
      scripts?: Record<string, string>;
    };

    expect(pkg.bin?.goodmemory).toBe("./scripts/goodmemory-cli.ts");
    expect(pkg.exports?.["."]).toBe("./src/index.ts");
    expect(pkg.exports?.["./cli"]).toBe("./src/cli.ts");
    expect(pkg.exports?.["./host"]).toBe("./src/host/index.ts");
    expect(pkg.exports?.["./ai-sdk"]).toBe("./src/ai-sdk/index.ts");
    expect(Object.keys(pkg.exports ?? {})).not.toContain("./llm/ai-sdk");
    expect(pkg.scripts?.cli).toBe("bun run scripts/goodmemory-cli.ts");
    expect(pkg.scripts?.["example:chat"]).toBe("bun run examples/basic-chat.ts");
    expect(pkg.scripts?.["example:coding-agent"]).toBe(
      "bun run examples/coding-agent.ts",
    );
    expect(pkg.scripts?.["example:vercel-ai"]).toBe(
      "bun run examples/vercel-ai-chat.ts",
    );
    expect(pkg.scripts?.["example:host-claude"]).toBe(
      "bun run examples/host-claude-artifacts.ts",
    );
    expect(pkg.scripts?.["example:host-codex"]).toBe(
      "bun run examples/host-codex-handoff.ts",
    );
    expect(pkg.scripts?.test).toBe("bun test");
    expect(pkg.scripts?.["test:all"]).toBe("bun --config=bunfig.all.toml test tests third-party");
    expect(pkg.scripts?.["test:coverage"]).toBe(
      "bun test --coverage --coverage-reporter=lcov --coverage-reporter=text && bun run scripts/check-coverage.ts",
    );
    expect(pkg.scripts?.["eval:smoke"]).toBe("bun run scripts/run-eval.ts --mode=smoke");
    expect(pkg.scripts?.["eval:fallback"]).toBe("bun run scripts/run-eval.ts --mode=fallback");
    expect(pkg.scripts?.["eval:phase-17"]).toBe("bun run scripts/run-phase-17-eval.ts");
    expect(pkg.scripts?.["eval:live"]).toBe("bun run scripts/run-eval.ts --mode=live");
    expect(pkg.scripts?.["eval:live-memory"]).toBe(
      "bun run scripts/run-eval.ts --mode=live-memory",
    );
    expect(pkg.scripts?.["eval:phase-17-live-memory"]).toBe(
      "bun run scripts/run-phase-17-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-25"]).toBe("bun run scripts/run-phase-25-eval.ts");
    expect(pkg.scripts?.["eval:phase-25-live-memory"]).toBe(
      "bun run scripts/run-phase-25-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-27"]).toBe("bun run scripts/run-phase-27-eval.ts");
    expect(pkg.scripts?.["gate:phase-18"]).toBe("bun run scripts/run-phase-18-gate.ts");
    expect(pkg.scripts?.["gate:phase-19-reviewer"]).toBe(
      "bun run scripts/run-phase-19-reviewer-gate.ts",
    );
    expect(pkg.scripts?.["gate:phase-19-maintenance"]).toBe(
      "bun run scripts/run-phase-19-maintenance-gate.ts",
    );
    expect(pkg.scripts?.["gate:phase-20"]).toBe("bun run scripts/run-phase-20-gate.ts");
    expect(pkg.scripts?.["gate:phase-25"]).toBe("bun run scripts/run-phase-25-gate.ts");
    expect(pkg.scripts?.["gate:phase-26"]).toBe("bun run scripts/run-phase-26-gate.ts");
    expect(pkg.scripts?.["eval:full"]).toBeUndefined();
  });

  it("package export targets resolve to files that still exist", async () => {
    const pkg = JSON.parse(
      await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
    ) as {
      exports?: Record<string, string | { import?: string }>;
    };

    for (const target of Object.values(pkg.exports ?? {})) {
      if (typeof target !== "string") {
        continue;
      }

      await access(join(import.meta.dir, "../../", target));
    }
  });

  it("root exports stay aligned with the declared public surface", async () => {
    const rootModule = (await import(
      pathToFileURL(join(import.meta.dir, "../../src/index.ts")).href
    )) as Record<string, unknown>;

    expect(rootModule.createGoodMemory).toBeDefined();
    expect(rootModule.createRuntimeArchiveStore).toBeDefined();
    expect(rootModule.createRuntimeContextService).toBeDefined();
    expect(rootModule.createHostAdapter).toBeUndefined();
    expect(rootModule.createGoodMemoryAISDK).toBeUndefined();
    expect(rootModule.createMemoryRepositories).toBeUndefined();
    expect(rootModule.createRecallEngine).toBeUndefined();
    expect(rootModule.createRememberEngine).toBeUndefined();
    expect(rootModule.createRuntimeSalvageHooks).toBeUndefined();
  });

  it("readme links the canonical docs, examples, cli, and eval flow", async () => {
    const readme = await readFile(join(import.meta.dir, "../../README.md"), "utf8");

    expect(readme).toContain("createGoodMemory");
    expect(readme).toContain("examples/basic-chat.ts");
    expect(readme).toContain("examples/coding-agent.ts");
    expect(readme).toContain("examples/vercel-ai-chat.ts");
    expect(readme).toContain("examples/host-claude-artifacts.ts");
    expect(readme).toContain("examples/host-codex-handoff.ts");
    expect(readme).toContain("GoodMemory-Reference-Integration-Guide.md");
    expect(readme).toContain("GoodMemory-Codex-Handoff-Setup-Guide.md");
    expect(readme).toContain("bun run cli -- inspect");
    expect(readme).toContain("createGoodMemoryAISDK");
    expect(readme).toContain("goodmemory/ai-sdk");
    expect(readme).toContain("ModelMessage");
    expect(readme).toContain('createHostAdapter');
    expect(readme).toContain('goodmemory/host');
    expect(readme).toContain('file-assisted');
    expect(readme).toContain('file-authoritative');
    expect(readme).toContain("goodmemory inspect");
    expect(readme).toContain("goodmemory export-memory");
    expect(readme).toContain("goodmemory stats");
    expect(readme).toContain("goodmemory eval inspect");
    expect(readme).toContain("goodmemory eval export-case");
    expect(readme).toContain("GoodMemory-Current-Status-and-Evidence.md");
    expect(readme).toContain("GoodMemory-First-Principles-and-Reference-Architecture.md");
    expect(readme).toContain("GoodMemory-OSS-Architecture-v1.md");
    expect(readme).toContain("docs/archive/quality-gates/README.md");
    expect(readme).toContain("GoodMemory-PRD.md");
    expect(readme).toContain("GoodMemory-TDD-and-Evaluation-Strategy.md");
    expect(readme).toContain("GoodMemory-Strategy-Rollout-Guide.md");
    expect(readme).toContain("bun run test:coverage");
    expect(readme).toContain("bun run test:all");
    expect(readme).toContain("eval:fallback");
    expect(readme).toContain("eval:live");
    expect(readme).toContain("eval:live-memory");
    expect(readme).toContain("eval:summary");
    expect(readme).toContain("observe -> assist -> promote");
    expect(readme).toContain("regression-dashboard.json");
    expect(readme).toContain("strategy-promotion-authorization.json");
    expect(readme).not.toContain("eval:full");
    expect(readme).not.toContain("GoodMemory-Phase-17-Quality-Gate.md");
    expect(readme).not.toContain("GoodMemory-Phase-18-Quality-Gate.md");
    expect(readme).not.toContain("GoodMemory-Phase-19-Reviewer-Quality-Gate.md");
    expect(readme).not.toContain("GoodMemory-Phase-19-Maintenance-Quality-Gate.md");
    expect(readme).not.toContain("GoodMemory-Phase-20-Quality-Gate.md");
    expect(readme).not.toContain("eval:phase-17");
    expect(readme).not.toContain("eval:phase-17-live-memory");
    expect(readme).not.toContain("gate:phase-18");
    expect(readme).not.toContain("gate:phase-19-reviewer");
    expect(readme).not.toContain("gate:phase-19-maintenance");
    expect(readme).not.toContain("gate:phase-20");
    expect(readme).not.toContain("goodmemory/evolution");
    expect(readme).not.toContain("strategyRollout");
    expect(readme).not.toContain("promotionGate");
  });

  it("phase-27 canonical guides and examples use public imports only", async () => {
    const files = [
      "README.md",
      "docs/GoodMemory-Reference-Integration-Guide.md",
      "docs/GoodMemory-Codex-Handoff-Setup-Guide.md",
      "examples/basic-chat.ts",
      "examples/coding-agent.ts",
      "examples/host-claude-artifacts.ts",
      "examples/host-codex-handoff.ts",
      "examples/vercel-ai-chat.ts",
      "tests/consumers/reference-package-smoke/smoke.mjs",
    ] as const;

    for (const relativePath of files) {
      const content = await readFile(
        join(import.meta.dir, "../../", relativePath),
        "utf8",
      );

      expect(content).not.toContain("../src");
      expect(content).not.toContain("../../src");
    }

    const referenceGuide = await readFile(
      join(
        import.meta.dir,
        "../../docs/GoodMemory-Reference-Integration-Guide.md",
      ),
      "utf8",
    );
    expect(referenceGuide).toContain('from "goodmemory"');
    expect(referenceGuide).toContain('from "goodmemory/ai-sdk"');
    expect(referenceGuide).toContain("createGoodMemory({})");

    const codexGuide = await readFile(
      join(
        import.meta.dir,
        "../../docs/GoodMemory-Codex-Handoff-Setup-Guide.md",
      ),
      "utf8",
    );
    expect(codexGuide).toContain('from "goodmemory"');
    expect(codexGuide).toContain('from "goodmemory/host"');
  });

  it("package-boundary reference consumer smoke uses package-name imports only", async () => {
    const fixtureRoot = join(
      import.meta.dir,
      "../../tests/consumers/reference-package-smoke",
    );
    const smokeSource = await readFile(join(fixtureRoot, "smoke.mjs"), "utf8");
    const importSpecifiers = [...smokeSource.matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-reference-consumer-"),
    );
    const rootPackagePath = join(import.meta.dir, "../../");

    try {
      expect(importSpecifiers).toEqual([
        "goodmemory",
        "goodmemory/ai-sdk",
        "goodmemory/host",
      ]);

      await cp(fixtureRoot, workspaceRoot, { recursive: true });

      const packageJsonPath = join(workspaceRoot, "package.json");
      const packageJson = await readFile(packageJsonPath, "utf8");
      await writeFile(
        packageJsonPath,
        packageJson.replace("__GOODMEMORY_ROOT__", rootPackagePath),
        "utf8",
      );

      const install = await runCommand({
        cmd: ["bun", "install"],
        cwd: workspaceRoot,
      });
      expect(install.exitCode).toBe(0);

      const smoke = await runCommand({
        cmd: ["bun", "run", "smoke"],
        cwd: workspaceRoot,
        env: {
          GOODMEMORY_STORAGE_PROVIDER: undefined,
          GOODMEMORY_STORAGE_URL: undefined,
          GOODMEMORY_EMBEDDING_PROVIDER: undefined,
          GOODMEMORY_EMBEDDING_MODEL: undefined,
          GOODMEMORY_EMBEDDING_API_KEY: undefined,
          GOODMEMORY_EMBEDDING_BASE_URL: undefined,
          GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: undefined,
          GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
          GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: undefined,
          GOODMEMORY_SQLITE_VECTOR_MODE: undefined,
          GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: undefined,
        },
      });
      expect(smoke.exitCode).toBe(0);
      expect(smoke.stdout).toContain('"ok":true');
      expect(smoke.stdout).toContain("MEMORY.md");

      const stats = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "stats",
          "--json",
          "--user-id",
          "consumer-user",
          "--workspace-id",
          "consumer-workspace",
        ],
        cwd: workspaceRoot,
        env: {
          GOODMEMORY_STORAGE_PROVIDER: undefined,
          GOODMEMORY_STORAGE_URL: undefined,
          GOODMEMORY_EMBEDDING_PROVIDER: undefined,
          GOODMEMORY_EMBEDDING_MODEL: undefined,
          GOODMEMORY_EMBEDDING_API_KEY: undefined,
          GOODMEMORY_EMBEDDING_BASE_URL: undefined,
          GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: undefined,
          GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
          GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: undefined,
          GOODMEMORY_SQLITE_VECTOR_MODE: undefined,
          GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: undefined,
        },
      });
      expect(stats.exitCode).toBe(0);
      expect(stats.stdout).toContain('"provider": "sqlite"');
      expect(stats.stdout).toContain('"facts": 1');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("release checklist exists and covers the final gate", async () => {
    const checklist = await readFile(
      join(import.meta.dir, "../../docs/GoodMemory-v1-Release-Checklist.md"),
      "utf8",
    );

    expect(checklist).toContain("CLI");
    expect(checklist).toContain("Examples");
    expect(checklist).toContain("Eval");
    expect(checklist).toContain("Quality Gate");
    expect(checklist).toContain("bun test");
    expect(checklist).toContain("bun run test:coverage");
    expect(checklist).toContain("eval:live");
    expect(checklist).toContain("eval:live-memory");
    expect(checklist).toContain("Strategy Rollout");
    expect(checklist).toContain("strategy-promotion-gate.json");
    expect(checklist).toContain("strategy-promotion-authorization.json");
    expect(checklist).toContain("regression-dashboard.json");
    expect(checklist).toContain("public-surface-decision.json");
    expect(checklist).toContain("GoodMemory-Current-Status-and-Evidence.md");
    expect(checklist).toContain("docs/archive/quality-gates/README.md");
    expect(checklist).toContain("GoodMemory-Strategy-Rollout-Guide.md");
    expect(checklist).toContain("rules-only");
    expect(checklist).toContain("salvage hooks");
    expect(checklist).not.toContain("eval:full");
    expect(checklist).not.toContain("GoodMemory-Phase-17-Quality-Gate.md");
    expect(checklist).not.toContain("GoodMemory-Phase-19-Reviewer-Quality-Gate.md");
    expect(checklist).not.toContain("GoodMemory-Phase-19-Maintenance-Quality-Gate.md");
    expect(checklist).not.toContain("GoodMemory-Phase-20-Quality-Gate.md");
    expect(checklist).not.toContain("gate:phase-19-reviewer");
    expect(checklist).not.toContain("gate:phase-19-maintenance");
    expect(checklist).not.toContain("gate:phase-20");
    expect(checklist).not.toContain("goodmemory/evolution");
    expect(checklist).not.toContain("strategyRollout");
    expect(checklist).not.toContain("promotionGate");
  });

  it("current status doc points to the stable evidence entrypoints and archive", async () => {
    const currentStatus = await readFile(
      join(
        import.meta.dir,
        "../../docs/GoodMemory-Current-Status-and-Evidence.md",
      ),
      "utf8",
    );

    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-20-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-20/run-20260420023503/phase-20-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-22-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-22/run-1776650772564-assist/report.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-23-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-23/run-1776658376536-promote/report.json",
    );
    expect(currentStatus).toContain("task-board/00-README.txt");
    expect(currentStatus).toContain("docs/archive/quality-gates/README.md");
  });

  it("phase quality gate docs live in the archive instead of the top-level docs folder", async () => {
    const topLevelDocs = await readdir(
      join(import.meta.dir, "../../docs"),
    );
    const archivedQualityGates = await readdir(
      join(import.meta.dir, "../../", QUALITY_GATE_ARCHIVE_ROOT),
    );

    expect(topLevelDocs).not.toContain("GoodMemory-Phase-16-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-17-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-18-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-19-Reviewer-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-19-Maintenance-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-20-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-21-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-22-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-23-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-25-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-26-Quality-Gate.md");
    expect(archivedQualityGates).toContain("README.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-16-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-17-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-18-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-19-Reviewer-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-19-Maintenance-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-20-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-21-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-22-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-23-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-25-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-26-Quality-Gate.md");
  });

  it("phase-18 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-18-Quality-Gate.md`,
      phaseDirectory: "phase-18",
      reportFileName: "phase-18-quality-gate.json",
      runId: "run-20260419031141",
    });
  });

  it("phase-19 reviewer quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-19-Reviewer-Quality-Gate.md`,
      phaseDirectory: "phase-19-reviewer",
      reportFileName: "phase-19-reviewer-quality-gate.json",
      runId: "run-20260419101816",
    });
  });

  it("phase-19 maintenance quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-19-Maintenance-Quality-Gate.md`,
      phaseDirectory: "phase-19-maintenance",
      reportFileName: "phase-19-maintenance-quality-gate.json",
      runId: "run-20260419101816",
    });
  });

  it("phase-20 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-20-Quality-Gate.md`,
      phaseDirectory: "phase-20",
      reportFileName: "phase-20-quality-gate.json",
      runId: "run-20260420023503",
    });
  });

  it("phase-22 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-22-Quality-Gate.md`,
      phaseDirectory: "phase-22",
      reportFileName: "phase-22-quality-gate.json",
      runId: "run-20260420020541",
    });
  });

  it("phase-23 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-23-Quality-Gate.md`,
      phaseDirectory: "phase-23",
      reportFileName: "phase-23-quality-gate.json",
      runId: "run-20260420061039",
    });
  });

  it("phase-25 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-25-Quality-Gate.md`,
      phaseDirectory: "phase-25",
      reportFileName: "phase-25-quality-gate.json",
      runId: "run-20260420082358",
    });
  });

  it("phase-26 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-26-Quality-Gate.md`,
      phaseDirectory: "phase-26",
      reportFileName: "phase-26-quality-gate.json",
      runId: "run-20260420193000",
    });
  });

  it("phase-21 through phase-23 closure docs only cite git-tracked live eval reports", async () => {
    await expectTrackedEvalReportsMentionedInFile(
      `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-21-Quality-Gate.md`,
    );
    await expectTrackedEvalReportsMentionedInFile(
      `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-22-Quality-Gate.md`,
    );
    await expectTrackedEvalReportsMentionedInFile(
      `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-23-Quality-Gate.md`,
    );
  });

  it("task-board sequencing and phase docs only cite git-tracked eval reports", async () => {
    for (const relativePath of [
      "task-board/00-README.txt",
      "task-board/23-phase-22-recall-router-provider-hardening-and-promotion-readiness.txt",
      "task-board/28-phase-27-reference-integration-gate-and-adoption-evidence.txt",
      "task-board/phase-27-reference-integration-gate-and-adoption-evidence/02-deterministic-adoption-eval.txt",
    ] as const) {
      await expectTrackedEvalReportsMentionedInFile(relativePath);
    }
  });

  it("phase-20 canonical dependency summaries are checked in", async () => {
    const qualityGateDoc = await readFile(
      join(
        import.meta.dir,
        "../../",
        QUALITY_GATE_ARCHIVE_ROOT,
        "GoodMemory-Phase-20-Quality-Gate.md",
      ),
      "utf8",
    );

    expect(qualityGateDoc).toContain(
      "archives dependency gate summary artifacts under `reports/quality-gates/phase-20/run-20260420023503/dependency-gates/`",
    );

    for (const relativePath of CANONICAL_PHASE20_DEPENDENCY_SUMMARY_ARTIFACTS) {
      await expectGitTrackedRepoArtifact(relativePath);
    }
  });

  it("coding-agent example stays on the public path and avoids internal evolution imports", async () => {
    const example = await readFile(
      join(import.meta.dir, "../../examples/coding-agent.ts"),
      "utf8",
    );

    expect(example).not.toContain("../src/evolution/salvage");
    expect(example).not.toContain("createRuntimeSalvageHooks");
    expect(example).not.toContain("SESSION_ARCHIVES_COLLECTION");
  });

  it("bun test discovery is pinned to the repository test tree", async () => {
    const bunfig = await readFile(join(import.meta.dir, "../../bunfig.toml"), "utf8");
    const allBunfig = await readFile(join(import.meta.dir, "../../bunfig.all.toml"), "utf8");

    expect(bunfig).toContain('[test]');
    expect(bunfig).toContain('root = "tests"');
    expect(allBunfig).toContain('[test]');
    expect(allBunfig).toContain('root = "."');
  });
});
