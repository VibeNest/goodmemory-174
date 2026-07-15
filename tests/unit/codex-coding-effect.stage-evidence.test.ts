import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadCodexCodingEffectStageEvidence,
  persistCodexCodingEffectStageEvidence,
} from "../../scripts/codex-coding-effect/stage-evidence";
import type {
  CodexCodingEffectStageEvidence,
} from "../../scripts/codex-coding-effect/stage-evidence";

const WORK_KEY = "episode-1/stage-2/no-memory/7/1";
const ATTEMPT_ID = `${WORK_KEY}#attempt-1`;
const PATCH_DIFF = "recorded patch\n";

describe("Codex coding-effect durable stage evidence", () => {
  it("round-trips one attempt bundle through its content-addressed filename", async () => {
    await withDirectory(async (directory) => {
      const evidence = stageEvidence();
      await persistCodexCodingEffectStageEvidence(directory, evidence);

      expect(await loadCodexCodingEffectStageEvidence(directory))
        .toEqual([evidence]);
      expect(await readdir(directory)).toEqual([
        `${createHash("sha256").update(ATTEMPT_ID).digest("hex")}.json`,
      ]);
    });
  });

  it("recovers a complete temporary artifact after an interrupted atomic link", async () => {
    await withDirectory(async (directory) => {
      await persistCodexCodingEffectStageEvidence(directory, stageEvidence());
      const [finalName] = await readdir(directory);
      if (finalName === undefined) {
        throw new Error("expected persisted evidence");
      }
      const temporaryName = finalName.replace(/\.json$/u, ".tmp");
      await rename(
        join(directory, finalName),
        join(directory, temporaryName),
      );

      expect(await loadCodexCodingEffectStageEvidence(directory))
        .toEqual([stageEvidence()]);
      expect(await readdir(directory)).toEqual([finalName]);
    });
  });

  it("fails closed when the patch or case identity is changed", async () => {
    await withDirectory(async (directory) => {
      await persistCodexCodingEffectStageEvidence(directory, stageEvidence());
      const [fileName] = await readdir(directory);
      if (fileName === undefined) {
        throw new Error("expected persisted evidence");
      }
      const path = join(directory, fileName);
      const value = JSON.parse(await readFile(path, "utf8")) as {
        caseResult: {
          arm: string;
          failToPassStatus: string;
        };
        patchDiff: string;
      };
      value.patchDiff = "different patch\n";
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await expect(loadCodexCodingEffectStageEvidence(directory))
        .rejects.toThrow("stage evidence patch does not match its case result");

      value.patchDiff = PATCH_DIFF;
      value.caseResult.arm = "goodmemory-installed";
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await expect(loadCodexCodingEffectStageEvidence(directory))
        .rejects.toThrow("case identity is inconsistent");

      value.caseResult.arm = "no-memory";
      value.caseResult.failToPassStatus = "failed";
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await expect(loadCodexCodingEffectStageEvidence(directory))
        .rejects.toThrow("stage evidence scoring semantics are inconsistent");
    });
  });
});

function stageEvidence(): CodexCodingEffectStageEvidence {
  return {
    attempt: {
      attemptId: ATTEMPT_ID,
      disposition: "finalized",
      result: {
        executionFailureStage: null,
        resolved: true,
        taskFailureReasons: [],
      },
      schemaVersion: 1,
      workKey: WORK_KEY,
    },
    caseResult: {
      arm: "no-memory",
      attemptId: ATTEMPT_ID,
      changedFiles: ["src/value.ts"],
      codexStatus: "completed",
      disposition: "finalized",
      episodeId: "episode-1",
      executionFailureStage: null,
      failToPassStatus: "passed",
      forbiddenFiles: [],
      pairKey: "episode-1/stage-2/7/1",
      passToPassStatus: "passed",
      patchSha256: createHash("sha256").update(PATCH_DIFF).digest("hex"),
      repetition: 1,
      resolved: true,
      schemaVersion: 1,
      seed: 7,
      stageId: "stage-2",
      taskFailureReasons: [],
      workKey: WORK_KEY,
    },
    codexStderr: "",
    codexStdout: "{}\n",
    failToPassStderr: "",
    failToPassStdout: "pass\n",
    passToPassStderr: "",
    passToPassStdout: "pass\n",
    patchDiff: PATCH_DIFF,
    schemaVersion: 1,
  };
}

async function withDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "goodmemory-stage-evidence-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
