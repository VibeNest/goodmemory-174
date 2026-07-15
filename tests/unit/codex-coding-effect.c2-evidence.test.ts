import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { projectC2NativeCanaryEvidence } from "../../scripts/project-codex-coding-effect-c2-evidence";

const FIXTURE_ROOT = join(import.meta.dir, "../../fixtures/codex-coding-effect");

interface C2EvidenceAttempt {
  accepted: boolean;
  modelTurnCount: number;
  runId: string;
}

interface C2EvidenceFixture {
  artifactHashes: Record<string, string>;
  attempts: C2EvidenceAttempt[];
  calibrationDisclosure: string;
  projection: {
    generator: string;
    runIdentitySha256: string;
    sourceResultSha256: string;
  };
  source: {
    commit: string;
    dirtyDiffSha256: string;
    dirtyStateSha256: string;
  };
  transcript: { sanitizedSha256: string };
}

describe("Codex C2 native host evidence", () => {
  it("retains the accepted run and every calibration attempt without widening the claim", async () => {
    const [evidenceRaw, transcriptMetadataRaw] = await Promise.all([
      readFile(join(FIXTURE_ROOT, "c2-native-host-canary.evidence.json"), "utf8"),
      readFile(
        join(FIXTURE_ROOT, "codex-rollout-0.144.3.metadata.json"),
        "utf8",
      ),
    ]);
    const evidence = JSON.parse(evidenceRaw) as C2EvidenceFixture;
    const transcriptMetadata = JSON.parse(transcriptMetadataRaw) as {
      sanitizedSha256: string;
    };

    expect(evidence).toMatchObject({
      accepted: true,
      acceptedRunId: "c2-native-20260715-010",
      checkpoint: "C2",
      claimBoundary: {
        hostCorrectnessOnly: true,
        publicCodingEffectProof: false,
      },
      evidenceClass: "host-canary",
      modelResponseUsedForAcceptance: false,
      rawRuntimeRetained: false,
      rawTranscriptPersistedByGoodMemory: false,
      schemaVersion: 2,
    });
    expect(evidence.attempts).toHaveLength(10);
    expect(evidence.attempts.map((attempt) => attempt.runId))
      .toEqual(Array.from(
        { length: 10 },
        (_, index) => `c2-native-20260715-${String(index + 1).padStart(3, "0")}`,
      ));
    expect(evidence.attempts.reduce(
      (total, attempt) => total + attempt.modelTurnCount,
      0,
    )).toBe(18);
    expect(evidence.attempts.filter((attempt) => attempt.accepted))
      .toHaveLength(3);
    expect(evidence.calibrationDisclosure).toContain("BM25");
    expect(evidence.projection.generator).toBe(
      "scripts/project-codex-coding-effect-c2-evidence.ts",
    );
    expect(evidence.projection.runIdentitySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.projection.sourceResultSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.source.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(evidence.source.dirtyDiffSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.source.dirtyStateSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.keys(evidence.artifactHashes).sort()).toEqual([
      "canary-result.json",
      "codex-rollout.audit.json",
      "cursor-state-after-first.json",
      "goodmemory-doctor.stdout.log",
      "goodmemory-seed.stdout.log",
      "goodmemory-status-before.stdout.log",
      "hooks.sanitized.json",
      "injection-state-after-first.json",
      "injection-state-final.json",
      "run-identity.json",
      "source-dirty.diff",
      "writeback-inspect-final.stdout.log",
      "writeback-inspect-first.stdout.log",
    ]);
    expect(Object.values(evidence.artifactHashes).every((hash) =>
      /^[a-f0-9]{64}$/u.test(hash)
    )).toBe(true);
    expect(evidence.transcript.sanitizedSha256)
      .toBe(transcriptMetadata.sanitizedSha256);
  });

  it("derives acceptance and hashes from runner artifacts and rejects identity drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c2-projection-"));
    const runId = "c2-native-test-001";
    const runRoot = join(root, "runs");
    const runDirectory = join(runRoot, runId);
    const fixtureRoot = join(root, "fixtures");
    const annotationsPath = join(root, "annotations.json");
    const packageSha256 = "a".repeat(64);
    const sanitizedTranscript = "{}\n";
    const transcript = {
      codexVersion: "codex-cli test",
      conversationMessageCount: 2,
      formatDrift: null,
      lineCount: 2,
      sanitizedSha256: sha256(sanitizedTranscript),
      sessionId: "thread-first",
      sourceSha256: "b".repeat(64),
    };
    const canaryResult = {
      codex: {
        firstThreadId: "thread-first",
        model: "gpt-test",
        secondThreadId: "thread-second",
        version: "codex-cli test",
      },
      evidenceClass: "host-canary",
      evaluation: {
        firstSessionDigest: "session:first",
        passed: true,
        reasons: [],
        recalledWritebackRecordIds: ["memory-writeback"],
        secondSessionDigest: "session:second",
        writebackRecordIds: ["memory-writeback"],
      },
      generatedAt: "2026-07-15T00:00:00.000Z",
      manualRolloutSelectionUsed: false,
      modelResponseUsedForAcceptance: false,
      package: { sha256: packageSha256, version: "goodmemory test" },
      passed: true,
      rawRuntimeRetained: false,
      rawTranscriptPersistedByGoodMemory: false,
      runId,
      schemaVersion: 1,
      transcript,
    };
    const hooks = "{}\n";
    const sourceDirtyDiff = "synthetic dirty diff\n";
    const runIdentity = {
      codex: {
        executableSha256: "c".repeat(64),
        hooks: { enabled: true, maturity: "stable" },
        model: "gpt-test",
        version: "codex-cli test",
      },
      goodmemory: {
        hookConfigSha256: sha256(hooks),
        packageSha256,
        version: "goodmemory test",
      },
      runId,
      schemaVersion: 1,
      source: {
        commit: "d".repeat(40),
        dirty: true,
        dirtyDiffSha256: sha256(sourceDirtyDiff),
        dirtyStateSha256: "f".repeat(64),
        untrackedFiles: [],
      },
    };

    try {
      await mkdir(runDirectory, { recursive: true });
      await Promise.all([
        writeJson(annotationsPath, {
          acceptedRunId: runId,
          attempts: [{ failureClass: null, result: "passed", runId }],
          calibrationDisclosure: "Synthetic projection test only.",
          schemaVersion: 1,
        }),
        writeJson(join(runDirectory, "canary-result.json"), canaryResult),
        writeFile(join(runDirectory, "codex-first.events.jsonl"), '{"type":"turn.completed"}\n'),
        writeFile(join(runDirectory, "codex-rollout.sanitized.jsonl"), sanitizedTranscript),
        writeFile(join(runDirectory, "codex-second.events.jsonl"), '{"type":"turn.completed"}\n'),
        writeJson(join(runDirectory, "codex-rollout.audit.json"), transcript),
        writeJson(join(runDirectory, "cursor-state-after-first.json"), {}),
        writeJson(join(runDirectory, "goodmemory-doctor.stdout.log"), {}),
        writeJson(join(runDirectory, "goodmemory-seed.stdout.log"), {
          events: [{ memoryId: "memory-seed", outcome: "written" }],
        }),
        writeJson(join(runDirectory, "goodmemory-status-before.stdout.log"), {}),
        writeFile(join(runDirectory, "hooks.sanitized.json"), hooks),
        writeJson(join(runDirectory, "injection-state-after-first.json"), {}),
        writeJson(join(runDirectory, "injection-state-final.json"), {}),
        writeJson(join(runDirectory, "run-identity.json"), runIdentity),
        writeFile(join(runDirectory, "source-dirty.diff"), sourceDirtyDiff, "utf8"),
        writeJson(join(runDirectory, "writeback-inspect-final.stdout.log"), {
          events: [{
            linkedRecordIds: [{ id: "memory-writeback", type: "memory" }],
            recalledBy: [{ sessionDigest: "session:second" }],
          }],
        }),
        writeJson(join(runDirectory, "writeback-inspect-first.stdout.log"), {}),
      ]);

      const projection = await projectC2NativeCanaryEvidence({
        annotationsPath,
        fixtureRoot,
        runRoot,
      });
      expect(projection.accepted).toBe(true);
      expect(projection.attempts[0]?.modelTurnCount).toBe(2);
      expect(projection.projection.sourceResultSha256).toBe(
        sha256(`${JSON.stringify(canaryResult, null, 2)}\n`),
      );

      await writeFile(join(runDirectory, "source-dirty.diff"), "tampered\n", "utf8");
      await expect(projectC2NativeCanaryEvidence({
        annotationsPath,
        fixtureRoot,
        runRoot,
      })).rejects.toThrow("source diff artifact does not match run identity");
      await writeFile(
        join(runDirectory, "source-dirty.diff"),
        sourceDirtyDiff,
        "utf8",
      );

      await writeJson(join(runDirectory, "run-identity.json"), {
        ...runIdentity,
        goodmemory: {
          ...runIdentity.goodmemory,
          packageSha256: "0".repeat(64),
        },
      });
      await expect(projectC2NativeCanaryEvidence({
        annotationsPath,
        fixtureRoot,
        runRoot,
      })).rejects.toThrow("does not match run identity");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
