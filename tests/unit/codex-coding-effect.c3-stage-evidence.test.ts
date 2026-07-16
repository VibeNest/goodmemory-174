import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  parseC3PilotStageEvidence,
} from "../../scripts/codex-coding-effect/c3-stage-evidence";

const SHA256 = "a".repeat(64);

describe("Codex coding-effect C3 stage evidence", () => {
  it("accepts no-memory absence evidence without a forged hook canary", () => {
    const evidence = baseEvidence("no-memory");
    expect(parseC3PilotStageEvidence({
      ...evidence,
      armEvidence: {
        absenceAudit: {
          codexHomeEntryNames: ["auth.json"],
          goodMemoryFileCount: 0,
          hookConfigPresent: false,
          mcpConfigPresent: false,
          passed: true,
          preexistingSessionCount: 0,
          reasons: [],
        },
        arm: "no-memory",
        evaluatorSecuritySha256: SHA256,
        historyExposure: "none",
        historySourceSha256: SHA256,
        instructionSha256: SHA256,
        permissionIsolation: permissionIsolation(),
        schemaVersion: 1,
        threadId: "thread-no-memory",
      },
    })).toMatchObject({
      armEvidence: {
        arm: "no-memory",
        historyExposure: "none",
      },
    });
  });

  it("binds installed package, seed receipt, injection, transcript, and Stop evidence", () => {
    const evidence = baseEvidence("goodmemory-installed");
    const parsed = parseC3PilotStageEvidence({
      ...evidence,
      armEvidence: installedArmEvidence(),
    });

    expect(parsed.armEvidence).toMatchObject({
      arm: "goodmemory-installed",
      historyExposure: "goodmemory-installed",
      hostCanary: {
        injectedExpectedMemoryIds: ["memory-001"],
        passed: true,
        stopCursorAdvanced: true,
        terminalWritebackStatuses: ["committed"],
      },
    });
  });

  it("rejects an installed stage whose canary claims success without expected injection", () => {
    const evidence = baseEvidence("goodmemory-installed");
    expect(() => parseC3PilotStageEvidence({
      ...evidence,
      armEvidence: {
        ...installedArmEvidence(),
        hostCanary: {
          ...installedArmEvidence().hostCanary,
          injectedExpectedMemoryIds: [],
        },
      },
    })).toThrow("invalid C3 installed arm evidence");
  });

  it("retains a failed installed canary as infrastructure failure", () => {
    const evidence = baseEvidence("goodmemory-installed");
    const failureStage = "goodmemory-injection";
    const failed = {
      ...evidence,
      armEvidence: {
        ...installedArmEvidence(),
        hostCanary: {
          ...installedArmEvidence().hostCanary,
          failureStage,
          injectedExpectedMemoryIds: [],
          passed: false,
          reasons: ["expected frozen-prehistory memory was not injected"],
        },
      },
      attempt: {
        ...evidence.attempt,
        disposition: "infrastructure-failure",
        result: {
          executionFailureStage: failureStage,
          resolved: false,
          taskFailureReasons: [],
        },
      },
      caseResult: {
        ...evidence.caseResult,
        disposition: "infrastructure-failure",
        executionFailureStage: failureStage,
        resolved: false,
        taskFailureReasons: [],
      },
    };

    expect(parseC3PilotStageEvidence(failed)).toMatchObject({
      attempt: { disposition: "infrastructure-failure" },
      caseResult: { executionFailureStage: failureStage },
    });
  });

  it("requires a failed recall preflight to prove Codex was not started", () => {
    const evidence = baseEvidence("goodmemory-installed");
    const failureStage = "goodmemory-recall-preflight";
    const failed = {
      ...evidence,
      armEvidence: {
        ...installedArmEvidence(),
        hostCanary: null,
        recallPreflight: {
          expectedMemoryIds: ["memory-001"],
          injectedMemoryIds: [],
          outputSha256: null,
          passed: false as const,
          reason: "injected preflight boundary failure",
          schemaVersion: 1 as const,
          stateSha256: null,
        },
      },
      attempt: {
        ...evidence.attempt,
        disposition: "infrastructure-failure",
        result: {
          executionFailureStage: failureStage,
          resolved: false,
          taskFailureReasons: [],
        },
      },
      caseResult: {
        ...evidence.caseResult,
        changedFiles: [],
        disposition: "infrastructure-failure",
        executionFailureStage: failureStage,
        patchSha256: null,
        resolved: false,
        taskFailureReasons: [],
      },
      codexStdout: "",
      patchDiff: "",
    };

    expect(() => parseC3PilotStageEvidence(failed)).toThrow(
      "failed C3 recall preflight did not prevent Codex launch",
    );
    expect(parseC3PilotStageEvidence({
      ...failed,
      caseResult: {
        ...failed.caseResult,
        codexStatus: "not-started",
      },
    })).toMatchObject({
      caseResult: {
        codexStatus: "not-started",
        executionFailureStage: failureStage,
      },
    });
  });
});

function baseEvidence(arm: "goodmemory-installed" | "no-memory") {
  const workKey = `episode-001/stage-2/${arm}/1/1`;
  const attemptId = `${workKey}#attempt-1`;
  const patchDiff = [
    "diff --git a/src/mode.ts b/src/mode.ts",
    "--- a/src/mode.ts",
    "+++ b/src/mode.ts",
    "@@ -1 +1 @@",
    "-const mode = value;",
    "+const mode = value.trim();",
    "",
  ].join("\n");
  return {
    attempt: {
      attemptId,
      disposition: "finalized",
      result: {
        executionFailureStage: null,
        resolved: true,
        taskFailureReasons: [],
      },
      schemaVersion: 1,
      workKey,
    },
    caseResult: {
      arm,
      attemptId,
      changedFiles: ["src/mode.ts"],
      codexStatus: "completed",
      disposition: "finalized",
      episodeId: "episode-001",
      executionFailureStage: null,
      failToPassStatus: "passed",
      forbiddenFiles: [],
      pairKey: "episode-001/stage-2/1/1",
      passToPassStatus: "passed",
      patchSha256: createHash("sha256").update(patchDiff).digest("hex"),
      repetition: 1,
      resolved: true,
      schemaVersion: 1,
      seed: 1,
      stageId: "stage-2",
      taskFailureReasons: [],
      workKey,
    },
    codexStderr: "",
    codexStdout: "{}\n",
    failToPassStderr: "",
    failToPassStdout: "pass\n",
    passToPassStderr: "",
    passToPassStdout: "pass\n",
    patchDiff,
    schemaVersion: 1,
  };
}

function installedArmEvidence() {
  return {
    arm: "goodmemory-installed" as const,
    evaluatorSecuritySha256: SHA256,
    historyExposure: "goodmemory-installed" as const,
    historySourceSha256: SHA256,
    hostCanary: {
      expectedMemoryIds: ["memory-001"],
      failureStage: null,
      injectedExpectedMemoryIds: ["memory-001"],
      passed: true,
      rawTranscriptPersisted: false,
      reasons: [],
      sessionDigest: "session:current",
      stateEvidenceSha256: SHA256,
      stopCursorAdvanced: true,
      terminalWritebackStatuses: ["committed"],
      threadId: "thread-installed",
      transcriptSourceSha256: SHA256,
    },
    instructionSha256: SHA256,
    permissionIsolation: permissionIsolation(),
    package: {
      sha256: SHA256,
      version: "0.5.1",
    },
    profile: {
      activationMode: "global" as const,
      hookRegistered: true,
      mcpRegistered: true,
      persistRawTranscript: false,
      retrievalProfile: "coding_agent" as const,
      workspaceStatus: "ok" as const,
      writebackMode: "selective" as const,
    },
    recallPreflight: {
      expectedMemoryIds: ["memory-001"],
      injectedMemoryIds: ["memory-001"],
      outputSha256: SHA256,
      passed: true as const,
      schemaVersion: 1 as const,
      stateSha256: SHA256,
    },
    schemaVersion: 1 as const,
    seedReceipt: {
      historySourceSha256: SHA256,
      memoryExportSha256: SHA256,
      rawTranscriptPersisted: false as const,
      schemaVersion: 1 as const,
      seedSurface: "codex-writeback-from-rollout" as const,
      sourceSessionDigest: "session:prehistory",
      writebackOutcome: "written" as const,
      writtenMemoryIds: ["memory-001"],
    },
  };
}

function permissionIsolation() {
  return {
    audit: {
      configSha256: SHA256,
      deniedReads: [{
        denied: true,
        exitCode: 1,
        label: "runner-source",
        path: "/fake/runner-source",
        pathSha256: SHA256,
      }],
      networkAccess: false as const,
      networkDenied: true as const,
      networkPositiveControl: true as const,
      passed: true,
      phase: "preflight" as const,
      profileName: "c3-task" as const,
      reasons: [],
      schemaVersion: 1 as const,
      workspaceRead: true,
      workspaceWrite: true,
    },
    evidenceSha256: SHA256,
  };
}
