import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  cleanupC3ControlledPilotFixture,
  prepareC3ControlledPilotFixture,
} from "../../scripts/codex-coding-effect/c3-controlled-pilot";
import {
  auditFrozenPrehistoryLeakage,
  loadFrozenPrehistory,
} from "../../scripts/codex-coding-effect/frozen-prehistory";
import { runBoundaryProcess } from "../../scripts/codex-coding-effect/process";
import { createLanguageService } from "../../src/language";
import { runEvaluatorTest } from "../../scripts/codex-coding-effect/test-scoring";
import { createDeterministicMemoryExtractor } from "../../src/remember/deterministicExtractor";

describe("Codex coding-effect C3 controlled pilot fixture", () => {
  it("keeps the evaluator sealed until scoring and proves the base/gold boundary", async () => {
    const parent = await mkdtemp(join(tmpdir(), "goodmemory-c3-controlled-pilot-"));
    const root = join(parent, "fixture");
    const fixture = await prepareC3ControlledPilotFixture({ root });

    try {
      expect(fixture.evaluatorRoot).toBe(join(root, "evaluator"));
      await expect(access(fixture.evaluatorRoot)).rejects.toThrow();
      expect(await git(fixture.sourceRepository, "rev-parse", "HEAD"))
        .toBe(fixture.expectedCommit);
      expect(await git(
        fixture.sourceRepository,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      )).toBe("");
      expect(basename(fixture.historySourcePath)).toMatch(
        /^rollout-.*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/u,
      );
      await expect(access(fixture.historySourcePath)).rejects.toThrow();

      await fixture.materializePrehistory();
      await access(fixture.historySourcePath);
      await expect(access(fixture.evaluatorRoot)).rejects.toThrow();

      const historyBytes = await readFile(fixture.historySourcePath, "utf8");
      expect(historyBytes).not.toContain("Remember that");
      expect(historyBytes).toContain(
        "parseTransportMode realistic configuration input update is blocked",
      );
      expect(sha256(historyBytes)).toBe(fixture.historySourceSha256);
      expect(historyBytes).toContain("trims only boundary whitespace");
      expect(historyBytes).toContain("exact lowercase values direct and relay");
      expect(historyBytes).toContain("rejecting aliases and case variants");
      expect(fixture.prompt).toContain(
        "Remember that this task's follow-up is to review the resulting parser patch.",
      );
      expect(fixture.declaredForbiddenSourceSha256).toEqual(
        fixture.forbiddenSources.map((source) => sha256(source.content)),
      );
      expect(fixture.evaluatorFiles).toEqual([
        {
          relativePath: "fail-to-pass.test.ts",
          sha256: sha256(fixture.forbiddenSources[1]!.content),
        },
        {
          relativePath: "pass-to-pass.test.ts",
          sha256: sha256(fixture.forbiddenSources[2]!.content),
        },
      ]);

      const history = await loadFrozenPrehistory({
        expectedSha256: fixture.historySourceSha256,
        path: fixture.historySourcePath,
      });
      const extracted = await createDeterministicMemoryExtractor().extract({
        messages: history.records.map((record) => ({
          content: record.message,
          role: record.role,
        })),
        scope: { userId: "c3-fixture" },
      });
      expect(extracted.candidates.map((candidate) => candidate.content)).toEqual([
        "The parseTransportMode realistic configuration input update is blocked until it trims only boundary whitespace before accepting the exact lowercase values direct and relay while preserving the public type and regression behavior by rejecting aliases and case variants.",
      ]);
      expect(extracted.candidates[0]?.metadata).toMatchObject({
        category: "project",
        factKind: "blocker",
        scopeKind: "project",
      });
      expect(createLanguageService().tokenOverlap(
        extracted.candidates[0]!.content,
        fixture.prompt,
        "en-US",
        { excludeStopwords: true },
      )).toBeGreaterThanOrEqual(0.2);
      expect(auditFrozenPrehistoryLeakage({
        artifact: history,
        declaredForbiddenSourceSha256:
          fixture.declaredForbiddenSourceSha256,
        forbiddenSources: fixture.forbiddenSources,
        forbiddenStrings: fixture.forbiddenStrings,
      })).toMatchObject({ overlaps: [], passed: true });

      await fixture.materializeEvaluator();
      await Promise.all([
        access(join(fixture.evaluatorRoot, "fail-to-pass.test.ts")),
        access(join(fixture.evaluatorRoot, "pass-to-pass.test.ts")),
      ]);

      const baseResults = await runFixtureTests(fixture);
      expect(baseResults).toEqual({
        failToPass: "failed",
        passToPass: "passed",
      });

      const goldSource = fixture.forbiddenSources.find(
        (source) => source.label === "gold-source:src/parse-transport-mode.ts",
      );
      if (goldSource === undefined) {
        throw new Error("controlled pilot fixture is missing its gold source");
      }
      await writeFile(
        join(fixture.sourceRepository, "src/parse-transport-mode.ts"),
        goldSource.content,
        "utf8",
      );

      expect(await runFixtureTests(fixture)).toEqual({
        failToPass: "passed",
        passToPass: "passed",
      });

      const markerPath = join(
        root,
        ".goodmemory-c3-controlled-pilot-owned",
      );
      const ownershipMarker = await readFile(markerPath, "utf8");
      await writeFile(markerPath, "foreign-owner\n", "utf8");
      await expect(cleanupC3ControlledPilotFixture(fixture)).rejects.toThrow(
        "ownership marker does not match",
      );
      await access(fixture.sourceRepository);
      await writeFile(markerPath, ownershipMarker, "utf8");
      await cleanupC3ControlledPilotFixture(fixture);
      await expect(access(root)).rejects.toThrow();
    } finally {
      if (await Bun.file(root).exists()) {
        await cleanupC3ControlledPilotFixture(fixture);
      }
      await rm(parent, { force: true, recursive: true });
    }
  });
});

interface FixtureTestInput {
  evaluatorRoot: string;
  failToPassCommand: readonly string[];
  passToPassCommand: readonly string[];
  sourceRepository: string;
}

async function runFixtureTests(fixture: FixtureTestInput): Promise<{
  failToPass: string;
  passToPass: string;
}> {
  const [failToPass, passToPass] = await Promise.all([
    runEvaluatorTest({
      command: fixture.failToPassCommand,
      cwd: fixture.sourceRepository,
      evaluatorRoot: fixture.evaluatorRoot,
      kind: "fail-to-pass",
      timeoutMs: 5_000,
    }),
    runEvaluatorTest({
      command: fixture.passToPassCommand,
      cwd: fixture.sourceRepository,
      evaluatorRoot: fixture.evaluatorRoot,
      kind: "pass-to-pass",
      timeoutMs: 5_000,
    }),
  ]);
  return {
    failToPass: failToPass.status,
    passToPass: passToPass.status,
  };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 5_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
