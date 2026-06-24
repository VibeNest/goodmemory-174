// Phase 66 v0.3 release-readiness gate. This does NOT run benchmarks; it proves
// the v0.3 public package surface is installable, importable, explainable, and
// rollback-safe. Each check is independent and reported pass/fail/skip; the gate
// writes reports/release/v0.3/readiness-report.json + summary.md and (with
// --strict) exits non-zero when a required check fails.
//
// Checks:
//   typecheck            bun run typecheck
//   unit-tests           bun test tests/unit            (skippable: --skip-tests)
//   build                bun run build + dist/ present  (skippable: --skip-build)
//   pack                 npm pack --json: files[] ships dist + READMEs + LICENSE
//   exports-resolution   every package.json exports target exists in dist
//   import-smoke         resolve the package BY NAME under real Node ESM via an
//                        offline node_modules symlink, importing every subpath and
//                        asserting the documented root symbols
//   cli-version          node scripts/goodmemory-cli.js -V / --version == version
//   version-consistency  package.json version matches README install lines and the
//                        Current-Status stable-package line; no stale version
//   docs-claim-boundary  README.zh-CN defers benchmark claims to the canonical
//                        Current-Status doc (conservative public surface)
//
//   bun run scripts/run-v0-3-release-readiness.ts -- [--skip-tests] [--skip-build] [--strict]
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const RELEASE_VERSION = "0.3";
const SUBPATH_EXPORTS = ["./host", "./ai-sdk", "./http", "./runtime-kit"] as const;
const ROOT_SYMBOLS = [
  "createGoodMemory",
  "createLocalEmbeddingAdapter",
  "iterativeRecall",
  "extractBridgeEntities",
] as const;

type CheckStatus = "pass" | "fail" | "skip";

interface CheckResult {
  detail: string;
  durationMs: number;
  id: string;
  required: boolean;
  status: CheckStatus;
  title: string;
}

interface CommandOutcome {
  code: number | null;
  durationMs: number;
  stderr: string;
  stdout: string;
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: Record<string, string> } & { now: () => number },
): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    const start = options.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: Error) => {
      resolve({ code: null, durationMs: options.now() - start, stderr: String(error), stdout });
    });
    child.on("close", (code: number | null) => {
      resolve({ code, durationMs: options.now() - start, stderr, stdout });
    });
  });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function tail(text: string, lines = 12): string {
  const trimmed = text.trimEnd().split("\n");
  return trimmed.slice(-lines).join("\n");
}

export interface ReleaseReadinessOptions {
  outputDir?: string;
  skipBuild?: boolean;
  skipTests?: boolean;
  strict?: boolean;
}

export interface ReleaseReadinessReport {
  allRequiredPassed: boolean;
  checks: CheckResult[];
  generatedAt: string;
  generatedBy: string;
  packageVersion: string;
  phase: "phase-66";
  summary: { failed: number; passed: number; skipped: number; total: number };
}

export async function runReleaseReadiness(
  options: ReleaseReadinessOptions = {},
): Promise<ReleaseReadinessReport> {
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = () => performance.now();
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, "package.json"), "utf8"),
  ) as { exports: Record<string, { import?: string } | string>; version: string };
  const version = packageJson.version;
  const checks: CheckResult[] = [];
  const record = (result: CheckResult): void => {
    checks.push(result);
  };

  // 1. typecheck
  {
    const outcome = await runCommand("bun", ["run", "typecheck"], { cwd: repoRoot, now });
    record({
      detail: outcome.code === 0 ? "tsc --noEmit clean" : tail(outcome.stdout + outcome.stderr),
      durationMs: Math.round(outcome.durationMs),
      id: "typecheck",
      required: true,
      status: outcome.code === 0 ? "pass" : "fail",
      title: "TypeScript typecheck",
    });
  }

  // 2. unit tests
  if (options.skipTests) {
    record({
      detail: "skipped via --skip-tests",
      durationMs: 0,
      id: "unit-tests",
      required: false,
      status: "skip",
      title: "Unit test suite",
    });
  } else {
    const outcome = await runCommand("bun", ["test", "tests/unit"], { cwd: repoRoot, now });
    record({
      detail: tail(outcome.stderr || outcome.stdout, 6),
      durationMs: Math.round(outcome.durationMs),
      id: "unit-tests",
      required: true,
      status: outcome.code === 0 ? "pass" : "fail",
      title: "Unit test suite",
    });
  }

  // 3. build
  {
    let status: CheckStatus = "pass";
    let detail = "";
    let durationMs = 0;
    if (options.skipBuild) {
      detail = "build skipped via --skip-build; validating existing dist/";
    } else {
      const outcome = await runCommand("bun", ["run", "build"], { cwd: repoRoot, now });
      durationMs = Math.round(outcome.durationMs);
      if (outcome.code !== 0) {
        status = "fail";
        detail = tail(outcome.stdout + outcome.stderr);
      }
    }
    if (status === "pass") {
      const distMain = join(repoRoot, "dist", "index.js");
      if (!(await pathExists(distMain))) {
        status = "fail";
        detail = `expected build output missing: ${distMain}`;
      } else {
        detail = detail || "dist/index.js present";
      }
    }
    record({ detail, durationMs, id: "build", required: true, status, title: "Build dist/" });
  }

  // 4. pack (files[] ships the right surface). --dry-run --ignore-scripts gets the
  //    file manifest from the ALREADY-built dist without re-running prepack (the
  //    build check above already validated the build), keeping stdout clean JSON.
  {
    const outcome = await runCommand("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: repoRoot,
      now,
    });
    let status: CheckStatus = "fail";
    let detail = tail(outcome.stderr || outcome.stdout);
    if (outcome.code === 0) {
      try {
        const parsed = JSON.parse(outcome.stdout) as Array<{ files?: Array<{ path: string }> }>;
        const files = new Set((parsed[0]?.files ?? []).map((file) => file.path));
        const wanted = [
          "dist/index.js",
          "dist/host/index.js",
          "dist/ai-sdk/index.js",
          "dist/http/index.js",
          "dist/runtime-kit/index.js",
          "README.md",
          "README.zh-CN.md",
          "LICENSE",
          "package.json",
        ];
        const missing = wanted.filter((file) => !files.has(file));
        status = missing.length === 0 ? "pass" : "fail";
        detail =
          missing.length === 0
            ? `tarball ships ${files.size} files incl. all dist subpaths + READMEs + LICENSE`
            : `tarball missing: ${missing.join(", ")}`;
      } catch (error) {
        detail = `could not parse npm pack --json output: ${String(error)}`;
      }
    }
    record({
      detail,
      durationMs: Math.round(outcome.durationMs),
      id: "pack",
      required: true,
      status,
      title: "npm pack file manifest",
    });
  }

  // 5. exports-resolution (every exports target exists in dist)
  {
    const start = now();
    const missing: string[] = [];
    for (const [subpath, mapping] of Object.entries(packageJson.exports)) {
      if (subpath === "./package.json") {
        continue;
      }
      const target = typeof mapping === "string" ? mapping : mapping.import;
      if (!target) {
        missing.push(`${subpath} (no import target)`);
        continue;
      }
      if (!(await pathExists(join(repoRoot, target)))) {
        missing.push(`${subpath} -> ${target}`);
      }
    }
    record({
      detail:
        missing.length === 0
          ? `all ${Object.keys(packageJson.exports).length - 1} export targets resolve`
          : `unresolved export targets: ${missing.join(", ")}`,
      durationMs: Math.round(now() - start),
      id: "exports-resolution",
      required: true,
      status: missing.length === 0 ? "pass" : "fail",
      title: "Package exports targets",
    });
  }

  // 6. import-smoke: resolve "goodmemory" + subpaths BY NAME under Node ESM via an
  //    offline node_modules symlink (no network install; deps resolve from the
  //    repo's own node_modules through the symlink realpath).
  {
    const smokeDir = join(repoRoot, "node_modules", ".cache", "release-readiness-smoke");
    const start = now();
    let status: CheckStatus = "fail";
    let detail = "";
    try {
      await rm(smokeDir, { force: true, recursive: true });
      await mkdir(join(smokeDir, "node_modules"), { recursive: true });
      await symlink(repoRoot, join(smokeDir, "node_modules", "goodmemory"), "dir");
      const smokeScript = `
const rootSymbols = ${JSON.stringify(ROOT_SYMBOLS)};
const subpaths = ${JSON.stringify(SUBPATH_EXPORTS.map((sub) => `goodmemory${sub.slice(1)}`))};
const root = await import("goodmemory");
for (const symbol of rootSymbols) {
  if (typeof root[symbol] !== "function") {
    throw new Error("goodmemory missing exported function: " + symbol);
  }
}
for (const sub of subpaths) {
  const mod = await import(sub);
  if (!mod || Object.keys(mod).length === 0) {
    throw new Error("empty subpath export: " + sub);
  }
}
console.log("IMPORT_SMOKE_OK");
`;
      const smokeFile = join(smokeDir, "smoke.mjs");
      await writeFile(smokeFile, smokeScript);
      const outcome = await runCommand("node", [smokeFile], { cwd: smokeDir, now });
      if (outcome.code === 0 && outcome.stdout.includes("IMPORT_SMOKE_OK")) {
        status = "pass";
        detail = `resolved goodmemory + ${SUBPATH_EXPORTS.length} subpaths by name under Node ${process.version}; root symbols present`;
      } else {
        detail = tail(outcome.stderr || outcome.stdout);
      }
    } catch (error) {
      detail = `smoke setup failed: ${String(error)}`;
    } finally {
      await rm(smokeDir, { force: true, recursive: true }).catch(() => undefined);
    }
    record({
      detail,
      durationMs: Math.round(now() - start),
      id: "import-smoke",
      required: true,
      status,
      title: "Node import smoke (by package name)",
    });
  }

  // 7. cli-version
  {
    const start = now();
    const expected = `goodmemory ${version}`;
    const cliPath = join(repoRoot, "scripts", "goodmemory-cli.js");
    const flagResults: string[] = [];
    let status: CheckStatus = "pass";
    for (const flag of ["--version", "-V"]) {
      const outcome = await runCommand("node", [cliPath, flag], { cwd: repoRoot, now });
      const ok = outcome.code === 0 && outcome.stdout.includes(expected);
      flagResults.push(`${flag}:${ok ? "ok" : "FAIL"}`);
      if (!ok) {
        status = "fail";
      }
    }
    record({
      detail:
        status === "pass"
          ? `${flagResults.join(" ")} -> "${expected}"`
          : `${flagResults.join(" ")} (expected "${expected}")`,
      durationMs: Math.round(now() - start),
      id: "cli-version",
      required: true,
      status,
      title: "CLI --version / -V",
    });
  }

  // 8. version-consistency (package.json <-> READMEs <-> Current-Status)
  {
    const start = now();
    const issues: string[] = [];
    const readmes = ["README.md", "README.zh-CN.md"];
    for (const readme of readmes) {
      const text = await readFile(join(repoRoot, readme), "utf8");
      if (!text.includes(`goodmemory@${version}`)) {
        issues.push(`${readme} has no goodmemory@${version} install line`);
      }
      const staleVersions = [...text.matchAll(/goodmemory@(\d+\.\d+\.\d+)/gu)]
        .map((match) => match[1])
        .filter((found) => found !== version);
      if (staleVersions.length > 0) {
        issues.push(`${readme} references stale version(s) ${[...new Set(staleVersions)].join(", ")}`);
      }
    }
    const minorLine = `v${version.split(".").slice(0, 2).join(".")}`; // e.g. v0.3
    const status = await readFile(
      join(repoRoot, "docs", "GoodMemory-Current-Status-and-Evidence.md"),
      "utf8",
    );
    if (!status.includes(`${minorLine}.x`) && !status.includes(minorLine)) {
      issues.push(`Current-Status stable-package line does not mention ${minorLine}.x`);
    }
    record({
      detail: issues.length === 0 ? `version ${version} consistent across READMEs + Current-Status` : issues.join("; "),
      durationMs: Math.round(now() - start),
      id: "version-consistency",
      required: true,
      status: issues.length === 0 ? "pass" : "fail",
      title: "Version / docs consistency",
    });
  }

  // 9. docs-claim-boundary (zh-CN defers to the canonical claim doc)
  {
    const start = now();
    const zh = await readFile(join(repoRoot, "README.zh-CN.md"), "utf8");
    const defers = zh.includes("GoodMemory-Current-Status-and-Evidence.md");
    record({
      detail: defers
        ? "README.zh-CN defers benchmark/claim detail to the canonical Current-Status doc"
        : "README.zh-CN does not link the canonical Current-Status claim doc",
      durationMs: Math.round(now() - start),
      id: "docs-claim-boundary",
      required: false,
      status: defers ? "pass" : "fail",
      title: "Public-surface claim boundary",
    });
  }

  const passed = checks.filter((check) => check.status === "pass").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  const skipped = checks.filter((check) => check.status === "skip").length;
  const allRequiredPassed = checks.every(
    (check) => !check.required || check.status === "pass",
  );

  const report: ReleaseReadinessReport = {
    allRequiredPassed,
    checks,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-v0-3-release-readiness.ts",
    packageVersion: version,
    phase: "phase-66",
    summary: { failed, passed, skipped, total: checks.length },
  };

  const outputDir = options.outputDir ?? join(repoRoot, "reports", "release", `v${RELEASE_VERSION}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "readiness-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(outputDir, "summary.md"), renderSummary(report));
  return report;
}

function statusIcon(status: CheckStatus): string {
  return status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
}

export function renderSummary(report: ReleaseReadinessReport): string {
  const lines: string[] = [];
  lines.push(`# v${RELEASE_VERSION} Release Readiness`);
  lines.push("");
  lines.push(`- package version: ${report.packageVersion}`);
  lines.push(`- generated: ${report.generatedAt}`);
  lines.push(
    `- result: ${report.allRequiredPassed ? "ALL REQUIRED CHECKS PASS" : "REQUIRED CHECK(S) FAILED"} (` +
      `${report.summary.passed} pass / ${report.summary.failed} fail / ${report.summary.skipped} skip)`,
  );
  lines.push("");
  lines.push("| Check | Required | Status | Detail |");
  lines.push("|---|---|---|---|");
  for (const check of report.checks) {
    const detail = check.detail.replace(/\n/gu, " ").replace(/\|/gu, "\\|").slice(0, 160);
    lines.push(
      `| ${check.title} | ${check.required ? "yes" : "no"} | ${statusIcon(check.status)} | ${detail} |`,
    );
  }
  lines.push("");
  lines.push(
    "Note: the published `goodmemory` CLI is a Node wrapper that delegates execution to Bun;" +
      " `--version` resolves without Bun, but non-version commands require Bun on PATH.",
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
  const options: ReleaseReadinessOptions = {
    outputDir: resolveCliFlagValue(Bun.argv, "--output-dir"),
    skipBuild: Bun.argv.includes("--skip-build"),
    skipTests: Bun.argv.includes("--skip-tests"),
    strict: Bun.argv.includes("--strict"),
  };
  const report = await runReleaseReadiness(options);
  process.stdout.write(renderSummary(report));
  if (options.strict && !report.allRequiredPassed) {
    process.exitCode = 1;
  }
}
