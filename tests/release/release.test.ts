import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "bun:test";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildPackageTarballName,
  loadPackageMetadataSync,
} from "../../scripts/package-metadata";

const QUALITY_GATE_ARCHIVE_ROOT = "docs/archive/quality-gates";
const ROOT_PACKAGE_PATH = join(import.meta.dir, "../../");
const CURRENT_PACKAGE = loadPackageMetadataSync(ROOT_PACKAGE_PATH);
const CURRENT_PACKAGE_VERSION = CURRENT_PACKAGE.version;
const CURRENT_TARBALL_NAME = buildPackageTarballName(CURRENT_PACKAGE);
const RELEASE_TEST_ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: undefined,
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: undefined,
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: undefined,
  GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: undefined,
  GOODMEMORY_EMBEDDING_API_KEY: undefined,
  GOODMEMORY_EMBEDDING_BASE_URL: undefined,
  GOODMEMORY_EMBEDDING_MODEL: undefined,
  GOODMEMORY_EMBEDDING_PROVIDER: undefined,
  GOODMEMORY_JUDGE_API_KEY: undefined,
  GOODMEMORY_JUDGE_BASE_URL: undefined,
  GOODMEMORY_JUDGE_MODEL: undefined,
  GOODMEMORY_JUDGE_PROVIDER: undefined,
  GOODMEMORY_RECALL_ROUTER_API_KEY: undefined,
  GOODMEMORY_RECALL_ROUTER_BASE_URL: undefined,
  GOODMEMORY_RECALL_ROUTER_MODEL: undefined,
  GOODMEMORY_RECALL_ROUTER_PROVIDER: undefined,
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: undefined,
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: undefined,
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
  GOODMEMORY_SQLITE_VECTOR_MODE: undefined,
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: undefined,
  GOODMEMORY_STORAGE_PROVIDER: undefined,
  GOODMEMORY_STORAGE_URL: undefined,
  GOODMEMORY_TEST_POSTGRES_URL: undefined,
} as const;
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
    cwd: ROOT_PACKAGE_PATH,
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
  stdin?: string;
}): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const stdin = input.stdin;
  const childProcess = Bun.spawn({
    cmd: input.cmd,
    cwd: input.cwd,
    env: createChildEnv(input.env),
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    if (!childProcess.stdin) {
      throw new Error("release test helper expected a writable stdin pipe");
    }
    childProcess.stdin.write(stdin);
    childProcess.stdin.end();
  }
  const stdout = await new Response(childProcess.stdout).text();
  const stderr = await new Response(childProcess.stderr).text();
  const exitCode = await childProcess.exited;

  return {
    exitCode,
    stderr,
    stdout,
  };
}

function extractJsonObject<T>(value: string): T {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Expected JSON output but none was found.");
  }

  return JSON.parse(value.slice(start, end + 1)) as T;
}

async function packReleaseTarball(outputDir: string): Promise<{
  tarballName: string;
  tarballPath: string;
}> {
  const pack = await runCommand({
    cmd: ["bun", "pm", "pack", "--destination", outputDir, "--quiet"],
    cwd: ROOT_PACKAGE_PATH,
  });

  expect(pack.exitCode).toBe(0);
  const tarballOutput = pack.stdout
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .at(-1);
  const tarballName =
    tarballOutput !== undefined
      ? basename(tarballOutput)
      : CURRENT_TARBALL_NAME;
  const tarballPath =
    tarballOutput === undefined
      ? join(outputDir, tarballName)
      : tarballOutput.includes("/")
        ? tarballOutput
        : join(outputDir, tarballOutput);

  return {
    tarballName,
    tarballPath,
  };
}

async function listTarballEntries(tarballPath: string): Promise<string[]> {
  const list = await runCommand({
    cmd: ["tar", "-tzf", tarballPath],
    cwd: ROOT_PACKAGE_PATH,
  });
  expect(list.exitCode).toBe(0);

  return list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toPackagedEntry(target: string): string {
  return `package/${target.replace(/^\.\//, "")}`;
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

async function expectGitTrackedPath(relativePath: string) {
  await access(join(import.meta.dir, "../../", relativePath));

  const tracked = await runGitCommand([
    "ls-files",
    "--error-unmatch",
    relativePath,
  ]);
  expect(tracked.exitCode).toBe(0);
  expect(tracked.stdout.trim()).toBe(relativePath);
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
    if (reportPath === "reports/eval/live-memory/phase-30/run-phase30-live-current/report.json") {
      await access(join(import.meta.dir, "../../", reportPath));
      continue;
    }
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
  const canonicalRunIds = [
    ...qualityGateDoc.matchAll(/Canonical accepted gate run:\s*`(run-\d{14})`/g),
  ].map((match) => match[1]!);
  const referencedRunIds =
    canonicalRunIds.length > 0
      ? canonicalRunIds
      : [...qualityGateDoc.matchAll(/run-\d{14}/g)].map((match) => match[0]);

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

    const relativeCandidateReportPath = `reports/quality-gates/${input.phaseDirectory}/${entry.name}/${input.reportFileName}`;
    const tracked = await runGitCommand([
      "ls-files",
      "--error-unmatch",
      relativeCandidateReportPath,
    ]);
    if (tracked.exitCode !== 0) {
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
      bugs?: {
        url?: string;
      };
      bin?: Record<string, string>;
      description?: string;
      engines?: Record<string, string>;
      exports?: Record<string, string | { import?: string; types?: string }>;
      files?: string[];
      homepage?: string;
      keywords?: string[];
      license?: string;
      packageManager?: string;
      private?: boolean;
      publishConfig?: Record<string, string>;
      repository?: {
        type?: string;
        url?: string;
      };
      scripts?: Record<string, string>;
      types?: string;
      version?: string;
    };

    expect(pkg.version).toBe(CURRENT_PACKAGE_VERSION);
    expect(pkg.private).toBeUndefined();
    expect(pkg.description).toBe(
      "Memory layer for chat, copilot, and agent applications.",
    );
    expect(pkg.license).toBe("MIT");
    expect(pkg.homepage).toBe("https://github.com/hjqcan/GoodMemory#readme");
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/hjqcan/GoodMemory.git",
    });
    expect(pkg.bugs?.url).toBe("https://github.com/hjqcan/GoodMemory/issues");
    expect(pkg.keywords).toEqual([
      "agents",
      "ai",
      "bun",
      "copilot",
      "llm",
      "memory",
      "node",
      "typescript",
    ]);
    expect(pkg.packageManager).toBeUndefined();
    expect(pkg.engines?.bun).toBe(">=1.3.0");
    expect(pkg.engines?.node).toBe(">=20.0.0");
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.files).toEqual([
      "LICENSE",
      "README.md",
      "dist",
      "docs",
      "package.json",
      "scripts/goodmemory-cli.js",
      "scripts/goodmemory-cli.ts",
      "scripts/goodmemory-mcp.js",
      "scripts/goodmemory-mcp.ts",
      "src",
    ]);
    expect(pkg.bin?.goodmemory).toBe("./scripts/goodmemory-cli.js");
    expect(pkg.bin?.["goodmemory-mcp"]).toBe("./scripts/goodmemory-mcp.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
    expect(pkg.exports?.["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    });
    expect(pkg.exports?.["./host"]).toEqual({
      import: "./dist/host/index.js",
      types: "./dist/host/index.d.ts",
    });
    expect(pkg.exports?.["./ai-sdk"]).toEqual({
      import: "./dist/ai-sdk/index.js",
      types: "./dist/ai-sdk/index.d.ts",
    });
    expect(pkg.exports?.["./package.json"]).toBe("./package.json");
    expect(Object.keys(pkg.exports ?? {})).not.toContain("./cli");
    expect(Object.keys(pkg.exports ?? {})).not.toContain("./llm/ai-sdk");
    expect(pkg.scripts?.clean).toBe("rm -rf dist");
    expect(pkg.scripts?.build).toBe(
      "bun run clean && bun run build:js && bun run build:types",
    );
    expect(pkg.scripts?.["build:js"]).toBe("bun run scripts/build-package.ts");
    expect(pkg.scripts?.["build:types"]).toBe("bunx tsc -p tsconfig.package.json");
    expect(pkg.scripts?.goodmemory).toBe("bun run scripts/goodmemory-cli.ts");
    expect(pkg.scripts?.["goodmemory:mcp"]).toBe("bun run scripts/goodmemory-mcp.ts");
    expect(pkg.scripts?.cli).toBeUndefined();
    expect(pkg.scripts?.["example:chat"]).toBe("bun run examples/basic-chat.ts");
    expect(pkg.scripts?.["example:coding-agent"]).toBe(
      "bun run examples/coding-agent.ts",
    );
    expect(pkg.scripts?.["example:ai-sdk-server"]).toBe(
      "bun run examples/plain-ai-sdk-server.ts",
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
    expect(pkg.scripts?.["eval:live-auto-memory"]).toBe(
      "bun run scripts/run-eval.ts --mode=live-auto-memory",
    );
    expect(pkg.scripts?.["eval:live-provider-memory"]).toBe(
      "bun run scripts/run-eval.ts --mode=live-provider-memory",
    );
    expect(pkg.scripts?.["eval:phase-17-live-memory"]).toBe(
      "bun run scripts/run-phase-17-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-25"]).toBe("bun run scripts/run-phase-25-eval.ts");
    expect(pkg.scripts?.["eval:phase-25-live-memory"]).toBe(
      "bun run scripts/run-phase-25-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-27"]).toBe("bun run scripts/run-phase-27-eval.ts");
    expect(pkg.scripts?.["eval:phase-27-live-memory"]).toBe(
      "bun run scripts/run-phase-27-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-30"]).toBe("bun run scripts/run-phase-30-eval.ts");
    expect(pkg.scripts?.["eval:phase-30-live-memory"]).toBe(
      "bun run scripts/run-phase-30-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-31"]).toBe("bun run scripts/run-phase-31-eval.ts");
    expect(pkg.scripts?.["eval:phase-31-live-memory"]).toBe(
      "bun run scripts/run-phase-31-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-32"]).toBe("bun run scripts/run-phase-32-eval.ts");
    expect(pkg.scripts?.["eval:phase-32-live-memory"]).toBe(
      "bun run scripts/run-phase-32-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-34"]).toBe("bun run scripts/run-phase-34-eval.ts");
    expect(pkg.scripts?.["eval:phase-34-live-memory"]).toBe(
      "bun run scripts/run-phase-34-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:phase-35"]).toBe("bun run scripts/run-phase-35-eval.ts");
    expect(pkg.scripts?.["eval:phase-35-live-memory"]).toBe(
      "bun run scripts/run-phase-35-live-memory.ts",
    );
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
    expect(pkg.scripts?.["gate:phase-27"]).toBe("bun run scripts/run-phase-27-gate.ts");
    expect(pkg.scripts?.["gate:phase-28"]).toBe("bun run scripts/run-phase-28-gate.ts");
    expect(pkg.scripts?.["gate:phase-29"]).toBe("bun run scripts/run-phase-29-gate.ts");
    expect(pkg.scripts?.["gate:phase-30"]).toBe("bun run scripts/run-phase-30-gate.ts");
    expect(pkg.scripts?.["gate:phase-31"]).toBe("bun run scripts/run-phase-31-gate.ts");
    expect(pkg.scripts?.["gate:phase-32"]).toBe("bun run scripts/run-phase-32-gate.ts");
    expect(pkg.scripts?.["gate:phase-33"]).toBe("bun run scripts/run-phase-33-gate.ts");
    expect(pkg.scripts?.["gate:phase-34"]).toBe("bun run scripts/run-phase-34-gate.ts");
    expect(pkg.scripts?.["gate:phase-35"]).toBe("bun run scripts/run-phase-35-gate.ts");
    expect(pkg.scripts?.["release:rc-dry-run"]).toBe(
      "bun run scripts/run-phase-29-rc-dry-run.ts",
    );
    expect(pkg.scripts?.prepack).toBe("bun run build");
    expect(pkg.scripts?.["eval:full"]).toBeUndefined();
  });

  it("package metadata includes a real MIT license file", async () => {
    const license = await readFile(join(import.meta.dir, "../../LICENSE"), "utf8");

    expect(license).toContain("MIT License");
    expect(license).toContain("Permission is hereby granted");
  });

  it("package export targets resolve inside the packed release artifact", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "goodmemory-export-pack-"));

    try {
      const { tarballPath } = await packReleaseTarball(outputDir);
      const packagedEntries = new Set(await listTarballEntries(tarballPath));
      const pkg = JSON.parse(
        await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
      ) as {
        exports?: Record<string, string | { import?: string; types?: string }>;
      };

      for (const target of Object.values(pkg.exports ?? {})) {
        if (typeof target === "string") {
          expect(packagedEntries.has(toPackagedEntry(target))).toBe(true);
          continue;
        }

        if (target.import) {
          expect(packagedEntries.has(toPackagedEntry(target.import))).toBe(true);
        }

        if (target.types) {
          expect(packagedEntries.has(toPackagedEntry(target.types))).toBe(true);
        }
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("packs a tarball that keeps the compiled package boundary and omits repo-only payload", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "goodmemory-phase29-pack-"));

    try {
      const dryRun = await runCommand({
        cmd: ["bun", "pm", "pack", "--dry-run"],
        cwd: ROOT_PACKAGE_PATH,
      });
      expect(dryRun.exitCode).toBe(0);

      const { tarballPath } = await packReleaseTarball(outputDir);
      const entries = await listTarballEntries(tarballPath);

      expect(entries).toContain("package/package.json");
      expect(entries).toContain("package/README.md");
      expect(entries).toContain("package/LICENSE");
      expect(entries).toContain("package/dist/index.js");
      expect(entries).toContain("package/dist/index.d.ts");
      expect(entries).toContain("package/dist/ai-sdk/index.js");
      expect(entries).toContain("package/dist/host/index.js");
      expect(entries).toContain("package/src/storage/sqliteRuntime.ts");
      expect(entries).toContain("package/scripts/goodmemory-cli.js");
      expect(entries).toContain("package/scripts/goodmemory-cli.ts");
      expect(entries).toContain("package/scripts/goodmemory-mcp.js");
      expect(entries).toContain("package/scripts/goodmemory-mcp.ts");
      expect(entries).toContain("package/docs/GoodMemory-Reference-Integration-Guide.md");
      expect(entries).toContain("package/docs/GoodMemory-Codex-Handoff-Setup-Guide.md");
      expect(entries).toContain("package/docs/GoodMemory-Claude-Code-Setup-Guide.md");
      expect(entries).not.toContain("package/tests/release/release.test.ts");
      expect(entries).not.toContain("package/task-board/00-README.txt");
      expect(entries).not.toContain("package/reports/quality-gates/phase-28/run-20260421093000/phase-28-quality-gate.json");
      expect(entries).not.toContain("package/.github/workflows/ci.yml");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("phase-28 sqlite-vss integration test uses portable runtime detection", async () => {
    const content = await readFile(
      join(import.meta.dir, "../../tests/integration/storage.sqlite-vss.test.ts"),
      "utf8",
    );

    expect(content).toContain("detectBundledSQLiteVssRuntime");
    expect(content).not.toContain("/Users/hjqcan/Documents/GoodMomery");
    expect(content).not.toContain("node_modules/sqlite-vss-darwin-arm64");
  });

  it("root exports stay aligned with the declared public surface", async () => {
    const rootModule = (await import(
      pathToFileURL(join(import.meta.dir, "../../src/index.ts")).href
    )) as Record<string, unknown>;

    expect(rootModule.createGoodMemory).toBeDefined();
    expect(rootModule.inspectGoodMemoryRuntime).toBeDefined();
    expect(rootModule.resolveGoodMemoryRuntimeInfo).toBeDefined();
    expect(rootModule.createRuntimeArchiveStore).toBeDefined();
    expect(rootModule.createRuntimeContextService).toBeDefined();
    expect(rootModule.createHostAdapter).toBeUndefined();
    expect(rootModule.createGoodMemoryAISDK).toBeUndefined();
    expect(rootModule.validateAgentInputEvent).toBeUndefined();
    expect(rootModule.validateHostAgentEvent).toBeUndefined();
    expect(rootModule.createMemoryRepositories).toBeUndefined();
    expect(rootModule.createRecallEngine).toBeUndefined();
    expect(rootModule.createRememberEngine).toBeUndefined();
    expect(rootModule.createRuntimeSalvageHooks).toBeUndefined();
    expect(rootModule.ExperienceRecord).toBeUndefined();
    expect(rootModule.LearningProposal).toBeUndefined();
    expect(rootModule.PromotionRecord).toBeUndefined();
    expect(rootModule.SessionArchive).toBeUndefined();
    expect(rootModule.createExperienceRecord).toBeUndefined();
    expect(rootModule.createLearningProposal).toBeUndefined();
    expect(rootModule.createPromotionRecord).toBeUndefined();
    expect(rootModule.createSessionArchive).toBeUndefined();
    expect(rootModule.EXPERIENCES_COLLECTION).toBeUndefined();
    expect(rootModule.LEARNING_PROPOSALS_COLLECTION).toBeUndefined();
    expect(rootModule.PROMOTION_RECORDS_COLLECTION).toBeUndefined();
    expect(rootModule.SESSION_ARCHIVES_COLLECTION).toBeUndefined();
  });

  it("readme links the canonical docs, examples, cli, and eval flow", async () => {
    const readme = await readFile(join(import.meta.dir, "../../README.md"), "utf8");

    expect(readme).toContain("createGoodMemory");
    expect(readme).toContain(CURRENT_PACKAGE_VERSION);
    expect(readme).toContain("Node-compatible");
    expect(readme).toContain("Bun-backed");
    expect(readme).toContain(`npm install goodmemory@${CURRENT_PACKAGE_VERSION}`);
    expect(readme).toContain(`bun add goodmemory@${CURRENT_PACKAGE_VERSION}`);
    expect(readme).toContain(`npm install ./${CURRENT_TARBALL_NAME}`);
    expect(readme).toContain("examples/basic-chat.ts");
    expect(readme).toContain("examples/coding-agent.ts");
    expect(readme).toContain("examples/plain-ai-sdk-server.ts");
    expect(readme).toContain("examples/vercel-ai-chat.ts");
    expect(readme).toContain("examples/host-claude-artifacts.ts");
    expect(readme).toContain("examples/host-codex-handoff.ts");
    expect(readme).toContain("GoodMemory-Reference-Integration-Guide.md");
    expect(readme).toContain("GoodMemory-Codex-Handoff-Setup-Guide.md");
    expect(readme).toContain("GoodMemory-Claude-Code-Setup-Guide.md");
    expect(readme).toContain("./node_modules/.bin/goodmemory inspect");
    expect(readme).toContain("./node_modules/.bin/goodmemory codex bootstrap");
    expect(readme).toContain("./node_modules/.bin/goodmemory claude bootstrap");
    expect(readme).toContain("createGoodMemoryAISDK");
    expect(readme).toContain("goodmemory/ai-sdk");
    expect(readme).toContain("ModelMessage");
    expect(readme).toContain("toTextStreamResponse");
    expect(readme).toContain("Request");
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
    expect(readme).toContain("eval:live-auto-memory");
    expect(readme).toContain("eval:live-provider-memory");
    expect(readme).toContain("auto-storage");
    expect(readme).toContain("GOODMEMORY_TEST_POSTGRES_URL");
    expect(readme).toContain("eval:summary");
    expect(readme).toContain("observe -> assist -> promote");
    expect(readme).toContain("regression-dashboard.json");
    expect(readme).toContain("strategy-promotion-authorization.json");
    expect(readme).not.toContain("Bun-only");
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
    expect(readme).not.toContain("bun run cli -- inspect");
  });

  it("installed-package CLI contract stays on the published bin path", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-cli-contract-consumer-"),
    );
    const packOutputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-cli-contract-pack-"),
    );

    try {
      const { tarballPath } = await packReleaseTarball(packOutputDir);
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-cli-contract-consumer",
            private: true,
            dependencies: {
              goodmemory: `file:${tarballPath}`,
            },
            scripts: {
              goodmemory: "echo consumer-script",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const install = await runCommand({
        cmd: ["bun", "install"],
        cwd: workspaceRoot,
      });
      expect(install.exitCode).toBe(0);

      const shadowed = await runCommand({
        cmd: ["bun", "run", "goodmemory", "--", "--help"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(shadowed.exitCode).toBe(0);
      expect(shadowed.stdout).toContain("consumer-script --help");

      const binHelp = await runCommand({
        cmd: ["./node_modules/.bin/goodmemory", "--help"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(binHelp.exitCode).toBe(0);
      expect(binHelp.stdout).toContain("GoodMemory CLI");
      expect(binHelp.stdout).toContain("inspect         Inspect scope-bounded memory");
      expect(binHelp.stdout).toContain("codex           Codex bootstrap and installed hook commands");
      expect(binHelp.stdout).toContain("claude          Claude Code bootstrap and installed hook commands");
      expect(binHelp.stdout).toContain("eval            Inspect eval run artifacts");
    } finally {
      await rm(packOutputDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("current top-level docs use the package-bin memory-first CLI contract", async () => {
    const readme = await readFile(join(import.meta.dir, "../../README.md"), "utf8");
    const architecture = await readFile(
      join(import.meta.dir, "../../docs/GoodMemory-OSS-Architecture-v1.md"),
      "utf8",
    );
    const claudeArchitecture = await readFile(
      join(import.meta.dir, "../../docs/claude-GoodMemory-Architecture-v0.1.md"),
      "utf8",
    );
    const currentStatus = await readFile(
      join(import.meta.dir, "../../docs/GoodMemory-Current-Status-and-Evidence.md"),
      "utf8",
    );
    const checklist = await readFile(
      join(import.meta.dir, "../../docs/GoodMemory-v1-Release-Checklist.md"),
      "utf8",
    );

    for (const content of [
      readme,
      architecture,
      claudeArchitecture,
      currentStatus,
      checklist,
    ]) {
      expect(content).not.toContain("bun run cli --");
      expect(content).not.toContain("bun run goodmemory --");
      expect(content).not.toContain("npx goodmemory inspect <userId>");
      expect(content).not.toContain("npx goodmemory trace <userId> <sessionId>");
      expect(content).not.toContain("npx goodmemory export <userId>");
    }

    expect(readme).toContain("./node_modules/.bin/goodmemory inspect --user-id");
    expect(readme).toContain("./node_modules/.bin/goodmemory eval inspect");
    expect(architecture).toContain("./node_modules/.bin/goodmemory inspect --user-id");
    expect(architecture).toContain("./node_modules/.bin/goodmemory export-memory");
    expect(architecture).toContain("./node_modules/.bin/goodmemory eval inspect");
    expect(claudeArchitecture).toContain(
      "./node_modules/.bin/goodmemory inspect --user-id",
    );
    expect(claudeArchitecture).toContain("./node_modules/.bin/goodmemory export-memory");
    expect(claudeArchitecture).toContain("./node_modules/.bin/goodmemory eval inspect");
    expect(currentStatus).toContain(
      "installed-package invocation path is `./node_modules/.bin/goodmemory ...`",
    );
    expect(checklist).toContain(
      "the installed CLI works through `./node_modules/.bin/goodmemory ...`",
    );
  });

  it("phase-27 canonical guides and examples use public imports only", async () => {
    const files = [
      "README.md",
      "docs/GoodMemory-Reference-Integration-Guide.md",
      "docs/GoodMemory-Codex-Handoff-Setup-Guide.md",
      "docs/GoodMemory-Claude-Code-Setup-Guide.md",
      "examples/basic-chat.ts",
      "examples/coding-agent.ts",
      "examples/plain-ai-sdk-server.ts",
      "examples/host-claude-artifacts.ts",
      "examples/host-codex-handoff.ts",
      "examples/vercel-ai-chat.ts",
      "tests/consumers/reference-package-smoke/smoke.mjs",
      "tests/consumers/reference-package-smoke/smoke-types.ts",
      "tests/consumers/bootstrap-package-smoke/seed.mjs",
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
    expect(referenceGuide).toContain("Request");
    expect(referenceGuide).toContain("toTextStreamResponse");
    expect(referenceGuide).toContain("plain-ai-sdk-server");
    expect(referenceGuide).toContain(
      `npm install goodmemory@${CURRENT_PACKAGE_VERSION}`,
    );
    expect(referenceGuide).toContain(`bun add goodmemory@${CURRENT_PACKAGE_VERSION}`);
    expect(referenceGuide).toContain(`npm install ./${CURRENT_TARBALL_NAME}`);
    expect(referenceGuide).toContain("Node");
    expect(referenceGuide).toContain("Bun");

    const codexGuide = await readFile(
      join(
        import.meta.dir,
        "../../docs/GoodMemory-Codex-Handoff-Setup-Guide.md",
      ),
      "utf8",
    );
    expect(codexGuide).toContain('from "goodmemory"');
    expect(codexGuide).toContain('from "goodmemory/host"');
    expect(codexGuide).toContain(`npm install goodmemory@${CURRENT_PACKAGE_VERSION}`);
    expect(codexGuide).toContain(`bun add goodmemory@${CURRENT_PACKAGE_VERSION}`);
    expect(codexGuide).toContain("Bun-backed");
    expect(codexGuide).toContain("codex-action.mjs");
    expect(codexGuide).toContain(".codex/hooks.json");
    expect(codexGuide).toContain("canonical enforced path");

    const claudeGuide = await readFile(
      join(
        import.meta.dir,
        "../../docs/GoodMemory-Claude-Code-Setup-Guide.md",
      ),
      "utf8",
    );
    expect(claudeGuide).toContain('from "goodmemory"');
    expect(claudeGuide).toContain('from "goodmemory/host"');
    expect(claudeGuide).toContain(
      `npm install goodmemory@${CURRENT_PACKAGE_VERSION}`,
    );
    expect(claudeGuide).toContain(`bun add goodmemory@${CURRENT_PACKAGE_VERSION}`);
    expect(claudeGuide).toContain("Bun-backed");
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
    const smokeTypesSource = await readFile(
      join(fixtureRoot, "smoke-types.ts"),
      "utf8",
    );
    const smokeTypeImportSpecifiers = [
      ...smokeTypesSource.matchAll(/from "([^"]+)"/g),
    ].map((match) => match[1]);
    const uniqueSmokeTypeImportSpecifiers = [...new Set(smokeTypeImportSpecifiers)];
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-reference-consumer-"),
    );
    const packOutputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-reference-pack-"),
    );

    try {
      expect(importSpecifiers).toEqual([
        "goodmemory",
        "goodmemory/ai-sdk",
        "goodmemory/host",
      ]);
      expect(uniqueSmokeTypeImportSpecifiers).toEqual([
        "goodmemory",
        "goodmemory/ai-sdk",
        "goodmemory/host",
      ]);

      const { tarballPath } = await packReleaseTarball(packOutputDir);
      await cp(fixtureRoot, workspaceRoot, { recursive: true });

      const packageJsonPath = join(workspaceRoot, "package.json");
      const packageJson = await readFile(packageJsonPath, "utf8");
      await writeFile(
        packageJsonPath,
        packageJson.replace(
          "__GOODMEMORY_PACKAGE_SPEC__",
          `file:${tarballPath}`,
        ),
        "utf8",
      );

      const install = await runCommand({
        cmd: ["bun", "install"],
        cwd: workspaceRoot,
      });
      expect(install.exitCode).toBe(0);
      await mkdir(join(workspaceRoot, "node_modules/@types"), { recursive: true });
      await cp(
        join(ROOT_PACKAGE_PATH, "node_modules/@types/bun"),
        join(workspaceRoot, "node_modules/@types/bun"),
        { recursive: true },
      );
      await cp(
        join(ROOT_PACKAGE_PATH, "node_modules/@types/node"),
        join(workspaceRoot, "node_modules/@types/node"),
        { recursive: true },
      );
      await cp(
        join(ROOT_PACKAGE_PATH, "node_modules/bun-types"),
        join(workspaceRoot, "node_modules/bun-types"),
        { recursive: true },
      );

      const smoke = await runCommand({
        cmd: ["bun", "run", "smoke"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(smoke.exitCode).toBe(0);
      const smokeJson = extractJsonObject<{
        aiSDKResponseText: string;
        artifactPaths: string[];
        contextIncludesChecklist: boolean;
        invalidScopeError?: string;
        invalidScopeStatus: number;
        ok: boolean;
        recallHitCount: number;
        serverRecallApplied: boolean;
        serverRememberSucceeded: boolean;
        validatedFileEditPath?: string;
        validatedToolPayloadShape?: string;
      }>(smoke.stdout);
      expect(smokeJson.ok).toBe(true);
      expect(smokeJson.aiSDKResponseText).toContain("Noted.");
      expect(smokeJson.contextIncludesChecklist).toBe(true);
      expect(smokeJson.invalidScopeStatus).toBe(400);
      expect(smokeJson.invalidScopeError).toContain("scope.userId");
      expect(smokeJson.recallHitCount).toBeGreaterThan(0);
      expect(smokeJson.serverRecallApplied).toBe(true);
      expect(smokeJson.serverRememberSucceeded).toBe(true);
      expect(smokeJson.artifactPaths).toContain("MEMORY.md");
      expect(smokeJson.validatedToolPayloadShape).toBe("object");
      expect(smokeJson.validatedFileEditPath).toBe(
        "playbooks/consumer-checklist.md",
      );

      const typeSmoke = await runCommand({
        cmd: [
          join(ROOT_PACKAGE_PATH, "node_modules/.bin/tsc"),
          "-p",
          "tsconfig.json",
          "--noEmit",
        ],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(typeSmoke.exitCode).toBe(0);

      const stats = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "stats",
          "--json",
          "--user-id",
          "consumer-memory-user",
          "--workspace-id",
          "consumer-memory-workspace",
        ],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(stats.exitCode).toBe(0);
      const statsJson = extractJsonObject<{
        counts?: {
          facts?: number;
        };
        storage?: {
          provider?: string;
        };
      }>(stats.stdout);
      expect(statsJson.storage?.provider).toBe("sqlite");
      expect(statsJson.counts?.facts).toBeGreaterThan(0);

    } finally {
      await rm(packOutputDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("package-boundary bootstrap consumer smoke scaffolds and exports Codex and Claude artifacts", async () => {
    const fixtureRoot = join(
      import.meta.dir,
      "../../tests/consumers/bootstrap-package-smoke",
    );
    const seedSource = await readFile(join(fixtureRoot, "seed.mjs"), "utf8");
    const seedImportSpecifiers = [...seedSource.matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-bootstrap-consumer-"),
    );
    const packOutputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-bootstrap-pack-"),
    );

    try {
      expect(seedImportSpecifiers).toEqual(["node:path", "goodmemory"]);

      const { tarballPath } = await packReleaseTarball(packOutputDir);
      await cp(fixtureRoot, workspaceRoot, { recursive: true });

      const packageJsonPath = join(workspaceRoot, "package.json");
      const packageJson = await readFile(packageJsonPath, "utf8");
      await writeFile(
        packageJsonPath,
        packageJson.replace(
          "__GOODMEMORY_PACKAGE_SPEC__",
          `file:${tarballPath}`,
        ),
        "utf8",
      );

      const install = await runCommand({
        cmd: ["bun", "install"],
        cwd: workspaceRoot,
      });
      expect(install.exitCode).toBe(0);

      const seed = await runCommand({
        cmd: ["bun", "run", "seed"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(seed.exitCode).toBe(0);

      const codexBootstrap = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "codex",
          "bootstrap",
          "--user-id",
          "consumer-user",
          "--workspace-id",
          "consumer-workspace",
          "--json",
        ],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(codexBootstrap.exitCode).toBe(0);
      const codexBootstrapJson = extractJsonObject<{
        changes: Array<{ relativePath: string }>;
        host: string;
      }>(codexBootstrap.stdout);
      expect(codexBootstrapJson.host).toBe("codex");
      expect(codexBootstrapJson.changes.some((change) => change.relativePath === "AGENTS.md")).toBe(
        true,
      );
      expect(
        codexBootstrapJson.changes.some(
          (change) => change.relativePath === ".goodmemory/bootstrap/codex-action.mjs",
        ),
      ).toBe(true);
      expect(
        codexBootstrapJson.changes.some(
          (change) => change.relativePath === ".codex/hooks.json",
        ),
      ).toBe(true);
      expect(
        codexBootstrapJson.changes.some(
          (change) => change.relativePath === ".codex/config.toml",
        ),
      ).toBe(true);
      expect(
        codexBootstrapJson.changes.some(
          (change) => change.relativePath === "codex/rules/goodmemory.rules",
        ),
      ).toBe(true);

      const claudeBootstrap = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "claude",
          "bootstrap",
          "--user-id",
          "consumer-user",
          "--workspace-id",
          "consumer-workspace",
          "--json",
        ],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(claudeBootstrap.exitCode).toBe(0);
      const claudeBootstrapJson = extractJsonObject<{
        changes: Array<{ relativePath: string }>;
        host: string;
      }>(claudeBootstrap.stdout);
      expect(claudeBootstrapJson.host).toBe("claude");
      expect(
        claudeBootstrapJson.changes.some((change) => change.relativePath === "CLAUDE.md"),
      ).toBe(true);

      const codexScript = await readFile(
        join(workspaceRoot, ".goodmemory/bootstrap/codex-export.mjs"),
        "utf8",
      );
      expect(codexScript).toContain('from "goodmemory"');
      expect(codexScript).toContain('from "goodmemory/host"');
      expect(codexScript).not.toContain("../src");
      expect(codexScript).not.toContain("../../src");
      const codexActionScript = await readFile(
        join(workspaceRoot, ".goodmemory/bootstrap/codex-action.mjs"),
        "utf8",
      );
      expect(codexActionScript).toContain('from "goodmemory"');
      expect(codexActionScript).toContain('from "goodmemory/host"');
      expect(codexActionScript).toContain("resolveHostActionExecutionPlan");
      expect(codexActionScript).not.toContain("../src");
      expect(codexActionScript).not.toContain("../../src");
      const codexHooksConfig = await readFile(
        join(workspaceRoot, ".codex/hooks.json"),
        "utf8",
      );
      expect(codexHooksConfig).toContain("PreToolUse");
      expect(codexHooksConfig).toContain("codex-action.mjs");
      const codexHooksToml = await readFile(
        join(workspaceRoot, ".codex/config.toml"),
        "utf8",
      );
      expect(codexHooksToml).toContain("[features]");
      expect(codexHooksToml).toContain("codex_hooks = true");
      const codexRules = await readFile(
        join(workspaceRoot, "codex/rules/goodmemory.rules"),
        "utf8",
      );
      expect(codexRules).toContain('pattern = ["deploy"]');
      expect(codexRules).toContain('pattern = ["rm", "-rf"]');

      const claudeScript = await readFile(
        join(workspaceRoot, ".goodmemory/bootstrap/claude-export.mjs"),
        "utf8",
      );
      expect(claudeScript).toContain('from "goodmemory"');
      expect(claudeScript).toContain('from "goodmemory/host"');
      expect(claudeScript).not.toContain("../src");
      expect(claudeScript).not.toContain("../../src");

      const codexExport = await runCommand({
        cmd: [
          "bun",
          "./.goodmemory/bootstrap/codex-export.mjs",
          "--session-id",
          "consumer-session",
        ],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(codexExport.exitCode).toBe(0);
      const codexExportJson = extractJsonObject<{
        artifactCount: number;
      }>(codexExport.stdout);
      expect(codexExportJson.artifactCount).toBeGreaterThan(0);

      const claudeExport = await runCommand({
        cmd: ["bun", "./.goodmemory/bootstrap/claude-export.mjs"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(claudeExport.exitCode).toBe(0);
      const claudeExportJson = extractJsonObject<{
        artifactCount: number;
      }>(claudeExport.stdout);
      expect(claudeExportJson.artifactCount).toBeGreaterThan(0);

      const sessionHandoff = await readFile(
        join(
          workspaceRoot,
          ".goodmemory/hosts/codex/session-memory/current.md",
        ),
        "utf8",
      );
      expect(sessionHandoff).toContain("Finish the bootstrap smoke path");
      expect(sessionHandoff).toContain("Verify exported session handoff");

      const claudeMemory = await readFile(
        join(workspaceRoot, ".goodmemory/hosts/claude/MEMORY.md"),
        "utf8",
      );
      expect(claudeMemory).toContain("smoke verification");

      const codexManifest = JSON.parse(
        await readFile(
          join(workspaceRoot, ".goodmemory/hosts/codex/export-manifest.json"),
          "utf8",
        ),
      ) as {
        artifacts: Array<{
          relativePath?: string;
        }>;
        host: string;
        scope: {
          sessionId?: string;
        };
      };
      expect(codexManifest.host).toBe("codex");
      expect(codexManifest.scope.sessionId).toBe("consumer-session");
      expect(
        codexManifest.artifacts.some(
          (artifact) => artifact.relativePath === "session-memory/current.md",
        ),
      ).toBe(true);

      const claudeManifest = JSON.parse(
        await readFile(
          join(workspaceRoot, ".goodmemory/hosts/claude/export-manifest.json"),
          "utf8",
        ),
      ) as {
        host: string;
        scope: {
          workspaceId?: string;
        };
      };
      expect(claudeManifest.host).toBe("claude");
      expect(claudeManifest.scope.workspaceId).toBe("consumer-workspace");
    } finally {
      await rm(packOutputDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("installed-package write CLI smoke covers write -> hook recall -> MCP deep read", async () => {
    const fixtureRoot = join(
      import.meta.dir,
      "../../tests/consumers/bootstrap-package-smoke",
    );
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-write-cli-consumer-"),
    );
    const homeRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-write-cli-home-"),
    );
    const packOutputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-write-cli-pack-"),
    );
    let transport: StdioClientTransport | null = null;

    try {
      const { tarballPath } = await packReleaseTarball(packOutputDir);
      await cp(fixtureRoot, workspaceRoot, { recursive: true });

      const packageJsonPath = join(workspaceRoot, "package.json");
      const packageJson = await readFile(packageJsonPath, "utf8");
      await writeFile(
        packageJsonPath,
        packageJson.replace(
          "__GOODMEMORY_PACKAGE_SPEC__",
          `file:${tarballPath}`,
        ),
        "utf8",
      );

      const install = await runCommand({
        cmd: ["bun", "install"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(install.exitCode).toBe(0);

      expect(
        (
          await runCommand({
            cmd: [
              "./node_modules/.bin/goodmemory",
              "install",
              "codex",
              "--user-id",
              "consumer-user",
              "--json",
            ],
            cwd: workspaceRoot,
            env: {
              ...RELEASE_TEST_ENV,
              GOODMEMORY_HOME: homeRoot,
            },
          })
        ).exitCode,
      ).toBe(0);

      expect(
        (
          await runCommand({
            cmd: [
              "./node_modules/.bin/goodmemory",
              "enable",
              "codex",
              "--workspace-id",
              "consumer-workspace",
              "--workspace-root",
              workspaceRoot,
              "--json",
            ],
            cwd: workspaceRoot,
            env: {
              ...RELEASE_TEST_ENV,
              GOODMEMORY_HOME: homeRoot,
            },
          })
        ).exitCode,
      ).toBe(0);

      const feedback = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "feedback",
          "--host",
          "codex",
          "--workspace-root",
          workspaceRoot,
          "--session-id",
          "consumer-session",
          "--signal",
          "Keep coding summaries short and list explicit next steps.",
          "--json",
        ],
        cwd: workspaceRoot,
        env: {
          ...RELEASE_TEST_ENV,
          GOODMEMORY_HOME: homeRoot,
        },
      });
      expect(feedback.exitCode).toBe(0);
      const feedbackJson = extractJsonObject<{
        accepted: boolean;
        memoryId?: string;
        scope: {
          agentId?: string;
          sessionId?: string;
          userId: string;
          workspaceId?: string;
        };
      }>(feedback.stdout);
      expect(feedbackJson.accepted).toBe(true);
      expect(feedbackJson.memoryId).toBeDefined();
      expect(feedbackJson.scope).toEqual({
        agentId: "codex",
        sessionId: "consumer-session",
        userId: "consumer-user",
        workspaceId: "consumer-workspace",
      });

      const remember = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "remember",
          "--host",
          "codex",
          "--workspace-root",
          workspaceRoot,
          "--session-id",
          "consumer-session",
          "--message",
          "Remember that the deploy is blocked on smoke verification.",
          "--json",
        ],
        cwd: workspaceRoot,
        env: {
          ...RELEASE_TEST_ENV,
          GOODMEMORY_HOME: homeRoot,
        },
      });
      expect(remember.exitCode).toBe(0);
      const rememberJson = extractJsonObject<{
        accepted: number;
      }>(remember.stdout);
      expect(rememberJson.accepted).toBeGreaterThan(0);

      const hook = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "codex",
          "hook",
          "user-prompt-submit",
        ],
        cwd: workspaceRoot,
        env: {
          ...RELEASE_TEST_ENV,
          GOODMEMORY_HOME: homeRoot,
        },
        stdin: JSON.stringify({
          cwd: workspaceRoot,
          prompt: "Summarize my preferred style and current blocker before you answer.",
          session_id: "consumer-session",
        }),
      });
      expect(hook.exitCode).toBe(0);
      expect(hook.stdout).toContain(
        "Keep coding summaries short and list explicit next steps.",
      );
      expect(hook.stdout).toContain("smoke verification");

      const emptyHook = await runCommand({
        cmd: [
          "./node_modules/.bin/goodmemory",
          "codex",
          "hook",
          "user-prompt-submit",
        ],
        cwd: workspaceRoot,
        env: {
          ...RELEASE_TEST_ENV,
          GOODMEMORY_HOME: homeRoot,
        },
        stdin: "",
      });
      expect(emptyHook.exitCode).toBe(0);
      expect(emptyHook.stdout.trim()).toBe("{}");
      expect(emptyHook.stderr.trim()).toBe("");

      transport = new StdioClientTransport({
        args: ["--host", "codex"],
        command: "./node_modules/.bin/goodmemory-mcp",
        cwd: workspaceRoot,
        env: createChildEnv({
          ...RELEASE_TEST_ENV,
          GOODMEMORY_HOME: homeRoot,
        }),
        stderr: "pipe",
      });

      const client = new Client(
        {
          name: "goodmemory-release-write-smoke",
          version: "0.0.0",
        },
        {
          capabilities: {},
        },
      );
      await client.connect(transport);

      const stats = await client.callTool({
        arguments: {
          cwd: workspaceRoot,
          sessionId: "consumer-session",
        },
        name: "goodmemory_stats",
      });
      expect(stats.structuredContent).toMatchObject({
        counts: {
          facts: 1,
          feedback: 1,
        },
        scope: {
          agentId: "codex",
          sessionId: "consumer-session",
          userId: "consumer-user",
          workspaceId: "consumer-workspace",
        },
      });

      const context = await client.callTool({
        arguments: {
          cwd: workspaceRoot,
          query: "Summarize my preferred style and current blocker before you answer.",
          sessionId: "consumer-session",
        },
        name: "goodmemory_get_context",
      });
      expect(context.structuredContent).toMatchObject({
        query: "Summarize my preferred style and current blocker before you answer.",
      });
      expect(JSON.stringify(context.structuredContent)).toContain(
        "Keep coding summaries short and list explicit next steps.",
      );
      expect(JSON.stringify(context.structuredContent)).toContain(
        "smoke verification",
      );
    } finally {
      if (transport) {
        await transport.close();
      }
      await rm(packOutputDir, { recursive: true, force: true });
      await rm(homeRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("release checklist exists and covers the final gate", async () => {
    const checklist = await readFile(
      join(import.meta.dir, "../../docs/GoodMemory-v1-Release-Checklist.md"),
      "utf8",
    );

    expect(checklist).toContain("CLI");
    expect(checklist).toContain("Examples");
    expect(checklist).toContain("Eval");
    expect(checklist).toContain("Quality Gate");
    expect(checklist).toContain("Package Boundary");
    expect(checklist).toContain("bun test");
    expect(checklist).toContain("bun run test:coverage");
    expect(checklist).toContain("bun pm pack --dry-run");
    expect(checklist).toContain(CURRENT_PACKAGE_VERSION);
    expect(checklist).toContain("Node");
    expect(checklist).toContain("Bun");
    expect(checklist).toContain("gate:phase-36");
    expect(checklist).toContain("tarball");
    expect(checklist).toContain("eval:live");
    expect(checklist).toContain("eval:live-memory");
    expect(checklist).toContain("eval:live-provider-memory");
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
    expect(checklist).not.toContain("strategyRollout");
    expect(checklist).not.toContain("promotionGate");
  }, 60_000);

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
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-29-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-29/run-20260421213000/phase-29-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-30-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-30/run-20260421153410/phase-30-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-30/run-phase30-live-current/report.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-31-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-31/run-20260422041616/phase-31-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-31/run-phase31-live-current/report.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-32-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-32/run-20260422085720/phase-32-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "reports/eval/fallback/phase-32/run-20260422173045/report.json",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-32/run-phase32-live-current/report.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-33-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-33/run-20260422212752/phase-33-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-34-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/eval/fallback/phase-34/run-20260422213045/report.json",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-34/run-phase34-live-current/report.json",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json",
    );
    expect(currentStatus).toContain(
      "docs/archive/quality-gates/GoodMemory-Phase-35-Quality-Gate.md",
    );
    expect(currentStatus).toContain(
      "reports/eval/fallback/phase-35/run-20260423173045/report.json",
    );
    expect(currentStatus).toContain(
      "reports/eval/live-memory/phase-35/run-phase35-live-current/report.json",
    );
    expect(currentStatus).toContain(
      "reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json",
    );
    expect(currentStatus).toContain("compiled `dist/` artifacts");
    expect(currentStatus).toContain("Bun-backed today");
    expect(currentStatus).toContain("runLiveMemoryEval()");
    expect(currentStatus).toContain("eval:live-provider-memory");
    expect(currentStatus).toContain("reports/eval/live-memory/phase-*");
    expect(currentStatus).toContain(
      "Phase 35 is now closed as the installed host-memory middleware and hooks slice.",
    );
    expect(currentStatus).toContain(
      "root `goodmemory` no longer re-exports internal evolution contracts",
    );
    expect(currentStatus).toContain(
      "adapter/event `user_correction` is proposal-first",
    );
    expect(currentStatus).toContain(
      "Phase 35 installed host-memory middleware is now part of the accepted stable host surface",
    );
    expect(currentStatus).not.toContain(
      "Phase 35 installed host-memory middleware work is present in the repo but is WIP",
    );
  });

  it("task-board current note documents the generic eval command contract", async () => {
    const taskBoard = await readFile(
      join(import.meta.dir, "../../task-board/00-README.txt"),
      "utf8",
    );

    expect(taskBoard).toContain("eval:live-memory");
    expect(taskBoard).toContain("auto-storage live memory");
    expect(taskBoard).toContain("eval:live-provider-memory");
    expect(taskBoard).toContain("reports/eval/live-memory/phase-*");
    expect(taskBoard).toContain(
      "Phase 34 is now closed again as the host pre-action policy, proposal-first correction, and public-surface closure slice",
    );
    expect(taskBoard).toContain(
      "adapter/event `user_correction` now takes the proposal-first path",
    );
    expect(taskBoard).toContain(
      "Phase 35 is now closed as the installed host-memory middleware and hooks slice",
    );
    expect(taskBoard).not.toContain("Phase 35 is now WIP again");
  });

  it("AGENTS.md keeps repository instructions aligned with the current eval contract", async () => {
    const agents = await readFile(
      join(import.meta.dir, "../../AGENTS.md"),
      "utf8",
    );

    expect(agents).toContain("eval:live-memory");
    expect(agents).toContain("auto-storage memory resolution");
    expect(agents).toContain("GOODMEMORY_STORAGE_PROVIDER");
    expect(agents).toContain("GOODMEMORY_STORAGE_URL");
    expect(agents).toContain("eval:live-auto-memory");
    expect(agents).toContain("eval:live-provider-memory");
    expect(agents).toContain("GOODMEMORY_TEST_POSTGRES_URL");
    expect(agents).toContain("phase-specific `*-live-memory` runners");
    expect(agents).not.toContain(
      "eval:live-memory`: run the provider-backed live eval path with Postgres storage",
    );
  });

  it("release workflow uses manual plus stable tag triggers, gate:phase-36, and tarball artifact upload", async () => {
    const workflow = await readFile(
      join(import.meta.dir, "../../.github/workflows/release.yml"),
      "utf8",
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("v*.*.*");
    expect(workflow).toContain("bun run gate:phase-36");
    expect(workflow).not.toContain("bun run gate:phase-35");
    expect(workflow).toContain("TAG_VERSION=\"${GITHUB_REF_NAME#v}\"");
    expect(workflow).toContain("Stable release workflow only supports stable semver versions");
    expect(workflow).toContain("[[ \"$VERSION\" == *-* ]]");
    expect(workflow).toContain("[[ \"$TAG_VERSION\" != \"$VERSION\" ]]");
    expect(workflow).toContain("bun pm pack");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("actions/setup-node@v4");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("registry-url: https://registry.npmjs.org");
    expect(workflow).toContain("softprops/action-gh-release@v2");
    expect(workflow).toContain("prerelease: false");
    expect(workflow).toContain("make_latest: true");
    expect(workflow).toContain("NPM_TOKEN");
    expect(workflow).toContain("Skipped: NPM_TOKEN secret is not configured.");
    expect(workflow).toContain("does not block the tarball-first stable release contract");
    expect(workflow).toContain("NPM_USER=\"$(npm whoami)\"");
    expect(workflow).toContain("already exists on npm; skipping publish.");
    expect(workflow).toContain("npm publish --access public");
    expect(workflow).toContain('npm view "goodmemory@${VERSION}" version');
    expect(workflow).toContain("npm view goodmemory@latest version");
    expect(workflow).toContain("Waiting for npm registry visibility");
    expect(workflow).toContain("npm registry verification failed");
    expect(workflow).not.toContain("npm publish --tag rc --access public");
    expect(workflow).not.toContain("npm view goodmemory@rc version");
  });

  it("github workflows pin Bun to the repository-supported Bun version", async () => {
    const pkg = JSON.parse(
      await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
    ) as {
      engines?: {
        bun?: string;
      };
    };
    const bunVersion = pkg.engines?.bun?.replace(/^[^0-9]*/, "");

    expect(bunVersion).toBe("1.3.0");
    for (const workflowPath of [
      ".github/workflows/ci.yml",
      ".github/workflows/eval.yml",
      ".github/workflows/release.yml",
    ]) {
      const workflow = await readFile(join(import.meta.dir, "../../", workflowPath), "utf8");
      expect(workflow).toContain(`bun-version: ${bunVersion}`);
      expect(workflow).not.toContain("bun-version: latest");
    }
  });

  it("ci workflow installs sqlite-vss Linux prerequisites before dependency install", async () => {
    const workflow = await readFile(
      join(import.meta.dir, "../../.github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("Install sqlite-vss Linux prerequisites");
    expect(workflow).toContain("sudo apt-get install -y libgomp1 libatlas-base-dev liblapack-dev");
    expect(workflow.indexOf("Install sqlite-vss Linux prerequisites")).toBeLessThan(
      workflow.indexOf("Install dependencies"),
    );
  });

  it("ci workflow runs the node package boundary matrix on Node 20 and 22", async () => {
    const workflow = await readFile(
      join(import.meta.dir, "../../.github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("node-package-boundary");
    expect(workflow).toContain("node-version: [20, 22]");
    expect(workflow).toContain("Build package boundary");
    expect(workflow).toContain("Verify Node package boundary");
    expect(workflow).toContain("tests/release/node-package-boundary.test.ts");
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
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-28-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-29-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-30-Quality-Gate.md");
    expect(topLevelDocs).not.toContain("GoodMemory-Phase-32-Quality-Gate.md");
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
    expect(archivedQualityGates).toContain("GoodMemory-Phase-28-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-29-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-30-Quality-Gate.md");
    expect(archivedQualityGates).toContain("GoodMemory-Phase-32-Quality-Gate.md");
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

  it("phase-28 quality gate doc points to one canonical accepted report", async () => {
    await expectCanonicalAcceptedQualityGate({
      docPath: `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-28-Quality-Gate.md`,
      phaseDirectory: "phase-28",
      reportFileName: "phase-28-quality-gate.json",
      runId: "run-20260421093000",
    });
  });

  it("phase-27 quality gate doc points to the canonical gate plus deterministic and live evidence", async () => {
    const docPath = `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-27-Quality-Gate.md`;
    const qualityGateDoc = await readFile(
      join(import.meta.dir, "../../", docPath),
      "utf8",
    );

    await expectCanonicalAcceptedQualityGate({
      docPath,
      phaseDirectory: "phase-27",
      reportFileName: "phase-27-quality-gate.json",
      runId: "run-20260421172000",
    });

    expect(qualityGateDoc).toContain(
      "reports/eval/fallback/phase-27/run-20260421165000/report.json",
    );
    expect(qualityGateDoc).toContain(
      "reports/eval/live-memory/phase-27/run-20260421170500/report.json",
    );

    await expectGitTrackedRepoArtifact(
      "reports/eval/fallback/phase-27/run-20260421165000/report.json",
    );
    await expectGitTrackedRepoArtifact(
      "reports/eval/live-memory/phase-27/run-20260421170500/report.json",
    );
  });

  it("phase-29 quality gate doc points to the canonical gate plus RC dry-run evidence", async () => {
    const docPath = `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-29-Quality-Gate.md`;
    const qualityGateDoc = await readFile(
      join(import.meta.dir, "../../", docPath),
      "utf8",
    );

    await expectCanonicalAcceptedQualityGate({
      docPath,
      phaseDirectory: "phase-29",
      reportFileName: "phase-29-quality-gate.json",
      runId: "run-20260421213000",
    });

    expect(qualityGateDoc).toContain(
      "reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json",
    );
    await expectGitTrackedPath(
      "reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json",
    );
  });

  it("phase-30 quality gate doc points to the canonical gate plus trace-backed live evidence", async () => {
    const docPath = `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-30-Quality-Gate.md`;
    const qualityGateDoc = await readFile(
      join(import.meta.dir, "../../", docPath),
      "utf8",
    );
    const relativeReportPath =
      "reports/quality-gates/phase-30/run-20260421153410/phase-30-quality-gate.json";
    const gateReport = JSON.parse(
      await readFile(
        join(import.meta.dir, "../../", relativeReportPath),
        "utf8",
      ),
    ) as {
      acceptance: {
        decision: string;
      };
      runId: string;
    };

    expect(qualityGateDoc).toContain("run-20260421153410");
    expect(gateReport.runId).toBe("run-20260421153410");
    expect(gateReport.acceptance.decision).toBe("accepted");
    await expectGitTrackedPath(relativeReportPath);

    expect(qualityGateDoc).toContain(
      "reports/eval/live-memory/phase-30/run-phase30-live-current/report.json",
    );
    await expectGitTrackedRepoArtifact(
      "reports/eval/live-memory/phase-30/run-phase30-live-current/report.json",
    );
  });

  it("phase-31 quality gate doc points to the canonical gate plus native host live evidence", async () => {
    const docPath = `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-31-Quality-Gate.md`;
    const qualityGateDoc = await readFile(
      join(import.meta.dir, "../../", docPath),
      "utf8",
    );
    const relativeReportPath =
      "reports/quality-gates/phase-31/run-20260422041616/phase-31-quality-gate.json";
    const gateReport = JSON.parse(
      await readFile(
        join(import.meta.dir, "../../", relativeReportPath),
        "utf8",
      ),
    ) as {
      acceptance: {
        decision: string;
      };
      runId: string;
    };

    expect(qualityGateDoc).toContain("run-20260422041616");
    expect(gateReport.runId).toBe("run-20260422041616");
    expect(gateReport.acceptance.decision).toBe("accepted");
    await expectGitTrackedPath(relativeReportPath);

    expect(qualityGateDoc).toContain(
      "reports/eval/live-memory/phase-31/run-phase31-live-current/report.json",
    );
    await expectGitTrackedRepoArtifact(
      "reports/eval/live-memory/phase-31/run-phase31-live-current/report.json",
    );
  });

  it("phase-32 quality gate doc points to the canonical gate plus external-host live evidence", async () => {
    const docPath = `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-32-Quality-Gate.md`;
    const qualityGateDoc = await readFile(
      join(import.meta.dir, "../../", docPath),
      "utf8",
    );
    const relativeReportPath =
      "reports/quality-gates/phase-32/run-20260422085720/phase-32-quality-gate.json";
    const gateReport = JSON.parse(
      await readFile(
        join(import.meta.dir, "../../", relativeReportPath),
        "utf8",
      ),
    ) as {
      acceptance: {
        decision: string;
      };
      runId: string;
    };

    expect(qualityGateDoc).toContain("run-20260422085720");
    expect(gateReport.runId).toBe("run-20260422085720");
    expect(gateReport.acceptance.decision).toBe("accepted");
    await expectGitTrackedPath(relativeReportPath);

    expect(qualityGateDoc).toContain(
      "reports/eval/fallback/phase-32/run-20260422173045/report.json",
    );
    await expectGitTrackedRepoArtifact(
      "reports/eval/fallback/phase-32/run-20260422173045/report.json",
    );

    expect(qualityGateDoc).toContain(
      "reports/eval/live-memory/phase-32/run-phase32-live-current/report.json",
    );
    await expectGitTrackedRepoArtifact(
      "reports/eval/live-memory/phase-32/run-phase32-live-current/report.json",
    );
  });

  it("phase-33 quality gate doc points to the canonical gate plus package-boundary evidence", async () => {
    const docPath = `${QUALITY_GATE_ARCHIVE_ROOT}/GoodMemory-Phase-33-Quality-Gate.md`;
    const qualityGateDoc = await readFile(
      join(import.meta.dir, "../../", docPath),
      "utf8",
    );
    const relativeReportPath =
      "reports/quality-gates/phase-33/run-20260422212752/phase-33-quality-gate.json";
    const gateReport = JSON.parse(
      await readFile(
        join(import.meta.dir, "../../", relativeReportPath),
        "utf8",
      ),
    ) as {
      acceptance: {
        decision: string;
      };
      runId: string;
    };

    expect(qualityGateDoc).toContain("run-20260422212752");
    expect(qualityGateDoc).toContain("tests/release/node-package-boundary.test.ts");
    expect(qualityGateDoc).toContain("plain AI SDK server");
    expect(qualityGateDoc).toContain("Node-compatible packaged library boundary");
    expect(gateReport.runId).toBe("run-20260422212752");
    expect(gateReport.acceptance.decision).toBe("accepted");
    await expectGitTrackedPath(relativeReportPath);
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

  it("canonical task-board ordering only references git-tracked phase artifacts", async () => {
    const board = await readFile(
      join(import.meta.dir, "../../task-board/00-README.txt"),
      "utf8",
    );
    const phaseFiles = [
      ...board.matchAll(/^\d+\.\s+([^\s]+\.txt)$/gm),
    ].map((match) => `task-board/${match[1]}`);

    expect(phaseFiles.length).toBeGreaterThan(0);

    const breakdownReadmes = new Set<string>();

    for (const phaseFile of phaseFiles) {
      await expectGitTrackedPath(phaseFile);
      const phaseContent = await readFile(
        join(import.meta.dir, "../../", phaseFile),
        "utf8",
      );
      for (const match of phaseContent.matchAll(
        /task-board\/(phase-[^/\s`]+\/00-README\.txt)/g,
      )) {
        breakdownReadmes.add(`task-board/${match[1]}`);
      }
    }

    expect(breakdownReadmes.size).toBeGreaterThan(0);

    for (const breakdownReadme of breakdownReadmes) {
      await expectGitTrackedPath(breakdownReadme);
    }
  });

  it("task-board sequencing and phase docs only cite git-tracked eval reports", async () => {
    for (const relativePath of [
      "docs/GoodMemory-Current-Status-and-Evidence.md",
      "task-board/00-README.txt",
      "task-board/23-phase-22-recall-router-provider-hardening-and-promotion-readiness.txt",
      "task-board/28-phase-27-reference-integration-gate-and-adoption-evidence.txt",
      "task-board/phase-27-reference-integration-gate-and-adoption-evidence/02-deterministic-adoption-eval.txt",
      "task-board/phase-27-reference-integration-gate-and-adoption-evidence/03-live-adoption-evidence.txt",
      "task-board/phase-27-reference-integration-gate-and-adoption-evidence/04-codex-handoff-gate-and-closure.txt",
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
