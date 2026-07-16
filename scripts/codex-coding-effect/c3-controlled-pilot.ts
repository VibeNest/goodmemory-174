import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { runBoundaryProcess } from "./process";

const OWNERSHIP_MARKER = ".goodmemory-c3-controlled-pilot-owned";
const ROLLOUT_FILE =
  "rollout-2026-07-15T12-00-00-7b60a0b4-84dc-4a6c-b12e-1e9ab837a75c.jsonl";
const FIXED_GIT_DATE = "2026-07-15T12:00:00+00:00";

const BASE_SOURCE = [
  'export type TransportMode = "direct" | "relay";',
  "",
  "export function parseTransportMode(value: string): TransportMode | null {",
  '  if (value === "direct" || value === "relay") {',
  "    return value;",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

const GOLD_SOURCE = [
  'export type TransportMode = "direct" | "relay";',
  "",
  "export function parseTransportMode(value: string): TransportMode | null {",
  "  const normalized = value.trim();",
  '  if (normalized === "direct" || normalized === "relay") {',
  "    return normalized;",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

const FAIL_TO_PASS_TEST = [
  'import { describe, expect, it } from "bun:test";',
  'import { pathToFileURL } from "node:url";',
  'import { resolve } from "node:path";',
  "",
  "interface TransportModeModule {",
  '  parseTransportMode(value: string): "direct" | "relay" | null;',
  "}",
  "",
  "const transport = await import(pathToFileURL(",
  '  resolve(process.cwd(), "src/parse-transport-mode.ts"),',
  ").href) as TransportModeModule;",
  "",
  'describe("parseTransportMode hidden boundary behavior", () => {',
  '  it("accepts known modes surrounded only by boundary whitespace", () => {',
  '    expect(transport.parseTransportMode(" \\t direct \\n")).toBe("direct");',
  '    expect(transport.parseTransportMode("\\r\\nrelay  ")).toBe("relay");',
  "  });",
  "});",
  "",
].join("\n");

const PASS_TO_PASS_TEST = [
  'import { describe, expect, it } from "bun:test";',
  'import { pathToFileURL } from "node:url";',
  'import { resolve } from "node:path";',
  "",
  "interface TransportModeModule {",
  '  parseTransportMode(value: string): "direct" | "relay" | null;',
  "}",
  "",
  "const transport = await import(pathToFileURL(",
  '  resolve(process.cwd(), "src/parse-transport-mode.ts"),',
  ").href) as TransportModeModule;",
  "",
  'describe("parseTransportMode regression behavior", () => {',
  '  it("preserves exact modes and rejects broadened vocabulary", () => {',
  '    expect(transport.parseTransportMode("direct")).toBe("direct");',
  '    expect(transport.parseTransportMode("relay")).toBe("relay");',
  '    expect(transport.parseTransportMode("DIRECT")).toBeNull();',
  '    expect(transport.parseTransportMode("proxy")).toBeNull();',
  '    expect(transport.parseTransportMode("direct mode")).toBeNull();',
  '    expect(transport.parseTransportMode("di rect")).toBeNull();',
  "  });",
  "});",
  "",
].join("\n");

const PREHISTORY_BYTES = [
  rolloutLine(
    "user",
    "The parseTransportMode realistic configuration input update is blocked until it trims only boundary whitespace before accepting the exact lowercase values direct and relay while preserving the public type and regression behavior by rejecting aliases and case variants.",
  ),
  rolloutLine(
    "assistant",
    "Recorded the canonical convention and pending parser update.",
  ),
  "",
].join("\n");

const FORBIDDEN_SOURCES = Object.freeze([
  Object.freeze({
    content: GOLD_SOURCE,
    label: "gold-source:src/parse-transport-mode.ts",
  }),
  Object.freeze({
    content: FAIL_TO_PASS_TEST,
    label: "hidden-evaluator:fail-to-pass.test.ts",
  }),
  Object.freeze({
    content: PASS_TO_PASS_TEST,
    label: "hidden-evaluator:pass-to-pass.test.ts",
  }),
]);

const FORBIDDEN_STRINGS = Object.freeze([
  "const normalized = value.trim();",
  'transport.parseTransportMode(" \\t direct \\n")',
  'transport.parseTransportMode("\\r\\nrelay  ")',
]);

const fixtureOwnership = new WeakMap<C3ControlledPilotFixture, string>();

export interface C3ControlledPilotForbiddenSource {
  content: string;
  label: string;
}

export interface C3ControlledPilotFixture {
  declaredForbiddenSourceSha256: readonly string[];
  evaluatorRoot: string;
  evaluatorFiles: ReadonlyArray<{
    relativePath: string;
    sha256: string;
  }>;
  expectedCommit: string;
  failToPassCommand: readonly string[];
  forbiddenSources: readonly C3ControlledPilotForbiddenSource[];
  forbiddenStrings: readonly string[];
  historySourcePath: string;
  historySourceSha256: string;
  materializeEvaluator: () => Promise<void>;
  materializePrehistory: () => Promise<void>;
  passToPassCommand: readonly string[];
  prompt: string;
  root: string;
  sourceRepository: string;
}

export async function prepareC3ControlledPilotFixture(input: {
  root: string;
}): Promise<C3ControlledPilotFixture> {
  const root = resolve(input.root);
  await assertAbsent(root, "controlled pilot root");
  await mkdir(root, { recursive: true });
  const ownershipToken = randomUUID();
  await writeFile(
    join(root, OWNERSHIP_MARKER),
    `${ownershipToken}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  try {
    const sourceRepository = join(root, "source");
    const evaluatorRoot = join(root, "evaluator");
    const historySourcePath = join(root, "prehistory", ROLLOUT_FILE);
    await createSourceRepository(sourceRepository);
    const expectedCommit = await runGit(sourceRepository, ["rev-parse", "HEAD"]);
    const status = await runGit(sourceRepository, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    if (status.length > 0) {
      throw new Error("controlled pilot source repository must be clean");
    }

    const fixture: C3ControlledPilotFixture = Object.freeze({
      declaredForbiddenSourceSha256: Object.freeze(
        FORBIDDEN_SOURCES.map((source) => sha256(source.content)),
      ),
      evaluatorRoot,
      evaluatorFiles: Object.freeze([
        Object.freeze({
          relativePath: "fail-to-pass.test.ts",
          sha256: sha256(FAIL_TO_PASS_TEST),
        }),
        Object.freeze({
          relativePath: "pass-to-pass.test.ts",
          sha256: sha256(PASS_TO_PASS_TEST),
        }),
      ]),
      expectedCommit,
      failToPassCommand: Object.freeze([
        resolve(process.execPath),
        "test",
        "{evaluatorRoot}/fail-to-pass.test.ts",
      ]),
      forbiddenSources: FORBIDDEN_SOURCES,
      forbiddenStrings: FORBIDDEN_STRINGS,
      historySourcePath,
      historySourceSha256: sha256(PREHISTORY_BYTES),
      materializeEvaluator: async () => {
        await mkdir(evaluatorRoot);
        await Promise.all([
          writeFile(
            join(evaluatorRoot, "fail-to-pass.test.ts"),
            FAIL_TO_PASS_TEST,
            { encoding: "utf8", flag: "wx" },
          ),
          writeFile(
            join(evaluatorRoot, "pass-to-pass.test.ts"),
            PASS_TO_PASS_TEST,
            { encoding: "utf8", flag: "wx" },
          ),
        ]);
      },
      materializePrehistory: async () => {
        await mkdir(dirname(historySourcePath), { recursive: true });
        await writeFile(historySourcePath, PREHISTORY_BYTES, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o400,
        });
        await chmod(historySourcePath, 0o400);
      },
      passToPassCommand: Object.freeze([
        resolve(process.execPath),
        "test",
        "{evaluatorRoot}/pass-to-pass.test.ts",
      ]),
      prompt:
        "Improve parseTransportMode for realistic configuration input while preserving its public type and current regression behavior. Keep the implementation dependency-free and run the relevant tests. Remember that this task's follow-up is to review the resulting parser patch.",
      root,
      sourceRepository,
    });
    fixtureOwnership.set(fixture, ownershipToken);
    return fixture;
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}

export async function cleanupC3ControlledPilotFixture(
  fixture: C3ControlledPilotFixture,
): Promise<void> {
  const ownershipToken = fixtureOwnership.get(fixture);
  if (ownershipToken === undefined) {
    throw new Error("controlled pilot fixture has no ownership record");
  }
  if (!await pathExists(fixture.root)) {
    return;
  }
  const markerPath = join(fixture.root, OWNERSHIP_MARKER);
  if (!await pathExists(markerPath)) {
    throw new Error("controlled pilot ownership marker is missing");
  }
  const marker = await readFile(markerPath, "utf8");
  if (marker !== `${ownershipToken}\n`) {
    throw new Error("controlled pilot ownership marker does not match");
  }
  await rm(fixture.root, { recursive: true });
}

async function createSourceRepository(sourceRepository: string): Promise<void> {
  await mkdir(join(sourceRepository, "src"), { recursive: true });
  await mkdir(join(sourceRepository, "tests"), { recursive: true });
  await Promise.all([
    writeFile(
      join(sourceRepository, "AGENTS.md"),
      [
        "# Contributor Instructions",
        "",
        "- Work only inside this repository.",
        "- Keep public types stable and preserve existing regression behavior.",
        "- Do not add dependencies for this task.",
        "- Run the relevant Bun tests before finishing.",
        "",
      ].join("\n"),
      "utf8",
    ),
    writeFile(
      join(sourceRepository, "README.md"),
      [
        "# Transport mode parser",
        "",
        "This evaluator-owned repository contains one pending parser robustness task.",
        "",
      ].join("\n"),
      "utf8",
    ),
    writeFile(
      join(sourceRepository, "package.json"),
      `${JSON.stringify({
        name: "goodmemory-c3-transport-mode-pilot",
        private: true,
        scripts: { test: "bun test" },
        type: "module",
      }, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      join(sourceRepository, "src/parse-transport-mode.ts"),
      BASE_SOURCE,
      "utf8",
    ),
    writeFile(
      join(sourceRepository, "tests/parse-transport-mode.test.ts"),
      [
        'import { describe, expect, it } from "bun:test";',
        'import { parseTransportMode } from "../src/parse-transport-mode";',
        "",
        'describe("parseTransportMode", () => {',
        '  it("accepts the two public transport modes", () => {',
        '    expect(parseTransportMode("direct")).toBe("direct");',
        '    expect(parseTransportMode("relay")).toBe("relay");',
        "  });",
        "",
        '  it("rejects unsupported values", () => {',
        '    expect(parseTransportMode("proxy")).toBeNull();',
        '    expect(parseTransportMode("DIRECT")).toBeNull();',
        "  });",
        "});",
        "",
      ].join("\n"),
      "utf8",
    ),
  ]);

  await runGit(sourceRepository, ["init", "--quiet"]);
  await runGit(sourceRepository, ["add", "."]);
  await runGit(
    sourceRepository,
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=GoodMemory C3 Fixture",
      "-c",
      "user.email=c3-fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Create controlled transport parser task",
    ],
    {
      ...process.env,
      GIT_AUTHOR_DATE: FIXED_GIT_DATE,
      GIT_COMMITTER_DATE: FIXED_GIT_DATE,
    },
  );
}

async function runGit(
  cwd: string,
  args: readonly string[],
  env?: Record<string, string | undefined>,
): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    env,
    executable: "git",
    timeoutMs: 10_000,
  });
  if (result.spawnError !== undefined) {
    throw new Error(`git failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error(`git ${args[0] ?? "command"} timed out`);
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args[0] ?? "command"} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function assertAbsent(path: string, label: string): Promise<void> {
  if (await pathExists(path)) {
    throw new Error(`${label} already exists: ${path}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";
}

function rolloutLine(role: "assistant" | "user", text: string): string {
  return JSON.stringify({
    payload: {
      content: [{
        text,
        type: role === "user" ? "input_text" : "output_text",
      }],
      role,
      type: "message",
    },
    type: "response_item",
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
