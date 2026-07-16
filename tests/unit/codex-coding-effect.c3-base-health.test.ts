import { describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertC3BaseHealthPassed,
  runC3BaseHealthProbe,
  serializeC3BaseHealthEvidence,
} from "../../scripts/codex-coding-effect/c3-base-health";

describe("Codex coding-effect C3 live base health", () => {
  it("binds a clean live snapshot and its passing visible test command", async () => {
    await withRepository(async ({ commit, repository }) => {
      const evidence = await runC3BaseHealthProbe({
        bunExecutable: process.execPath,
        expectedCommit: commit,
        expectedFailToPassOutputFragments: ["expected-boundary-failure"],
        failToPassSource:
          'console.error("expected-boundary-failure"); process.exit(1);\n',
        passToPassSource: "process.exit(0);\n",
        visibleCommand: [process.execPath, "test", "tests/base-health.test.ts"],
        workspace: repository,
      });

      expect(assertC3BaseHealthPassed(evidence)).toMatchObject({
        commit,
        dependencyLocks: [],
        hiddenEvaluatorLifecycle: "stdin-data-url-no-file",
        passed: true,
        probes: {
          failToPass: {
            expectation: "fail-with-fingerprint",
            fingerprintMatched: true,
            sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            status: "failed-as-expected",
          },
          passToPass: { expectation: "pass", status: "passed" },
          visible: { expectation: "pass", status: "passed" },
        },
        schemaVersion: 1,
        statusAfter: "",
        statusBefore: "",
      });
      expect(serializeC3BaseHealthEvidence(evidence)).toBe(
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
    });
  });

  it("fails closed when the probe mutates the live task snapshot", async () => {
    await withRepository(async ({ commit, repository }) => {
      const evidence = await runC3BaseHealthProbe({
        bunExecutable: process.execPath,
        expectedCommit: commit,
        expectedFailToPassOutputFragments: ["expected-boundary-failure"],
        failToPassSource:
          'console.error("expected-boundary-failure"); process.exit(1);\n',
        passToPassSource: "process.exit(0);\n",
        visibleCommand: [
          process.execPath,
          "-e",
          'await Bun.write("generated.txt", "unexpected\\n");',
        ],
        workspace: repository,
      });

      expect(evidence).toMatchObject({
        passed: false,
        reasons: ["base-health command changed the live workspace"],
      });
      expect(() => assertC3BaseHealthPassed(evidence)).toThrow(
        "C3 live base-health failed",
      );
    });
  });

  it("rejects an expected failure that does not match the frozen fingerprint", async () => {
    await withRepository(async ({ commit, repository }) => {
      const evidence = await runC3BaseHealthProbe({
        bunExecutable: process.execPath,
        expectedCommit: commit,
        expectedFailToPassOutputFragments: ["different-failure"],
        failToPassSource:
          'console.error("expected-boundary-failure"); process.exit(1);\n',
        passToPassSource: "process.exit(0);\n",
        visibleCommand: [process.execPath, "test", "tests/base-health.test.ts"],
        workspace: repository,
      });

      expect(evidence).toMatchObject({
        passed: false,
        probes: {
          failToPass: {
            fingerprintMatched: false,
            status: "unexpected-result",
          },
        },
      });
      expect(evidence.reasons).toContain(
        "fail-to-pass probe did not match the frozen failure fingerprint",
      );
    });
  });
});

async function withRepository(
  run: (input: {
    commit: string;
    repository: string;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-base-health-"));
  const repository = join(root, "repository");
  try {
    await mkdir(join(repository, "src"), { recursive: true });
    await mkdir(join(repository, "tests"), { recursive: true });
    await Promise.all([
      writeFile(
        join(repository, "package.json"),
        `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        join(repository, "src", "value.ts"),
        "export const value = 1;\n",
        "utf8",
      ),
      writeFile(
        join(repository, "tests", "base-health.test.ts"),
        [
          'import { expect, test } from "bun:test";',
          'import { value } from "../src/value";',
          "test(\"base health\", () => expect(value).toBe(1));",
          "",
        ].join("\n"),
        "utf8",
      ),
    ]);
    await git(repository, "init", "--quiet");
    await git(repository, "add", ".");
    await git(
      repository,
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=C3 Base Health",
      "-c",
      "user.email=c3-base-health@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    const commit = await git(repository, "rev-parse", "HEAD");
    await run({ commit, repository });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const child = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr);
  }
  return stdout.trim();
}
