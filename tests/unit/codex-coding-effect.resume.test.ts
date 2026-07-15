import { describe, expect, it } from "bun:test";
import {
  appendFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openCodexCodingEffectAttemptLedger,
  serializeAttemptRow,
  serializeProgressRow,
} from "../../scripts/codex-coding-effect/attempts";
import type {
  CodexCodingEffectAttemptRow,
  CodexCodingEffectProgressRow,
} from "../../scripts/codex-coding-effect/attempts";

const WORK_KEY = "episode-001/stage-1/no-memory/1/1";
const OTHER_WORK_KEY = "episode-002/stage-1/no-memory/1/1";
const IDENTITY = {
  evidenceClass: "deterministic-smoke",
  runId: "run-c1",
  schemaVersion: 1,
  selectionHash: "a".repeat(64),
};

function attempt(input: {
  attemptId?: string;
  disposition?: CodexCodingEffectAttemptRow["disposition"];
  resolved?: boolean;
  workKey?: string;
} = {}): CodexCodingEffectAttemptRow {
  const disposition = input.disposition ?? "finalized";
  const resolved = input.resolved ?? true;
  return {
    attemptId: input.attemptId ?? `${WORK_KEY}#attempt-1`,
    disposition,
    result: {
      executionFailureStage: disposition === "infrastructure-failure"
        ? "codex-launch"
        : null,
      resolved: disposition === "infrastructure-failure" ? false : resolved,
      taskFailureReasons: disposition === "infrastructure-failure"
        ? []
        : resolved
        ? []
        : ["hidden-fail-to-pass-failed"],
    },
    schemaVersion: 1,
    workKey: input.workKey ?? WORK_KEY,
  };
}

function progress(
  sourceAttempt: CodexCodingEffectAttemptRow = attempt(),
): CodexCodingEffectProgressRow {
  return {
    attemptId: sourceAttempt.attemptId,
    resolved: sourceAttempt.result.resolved,
    schemaVersion: 1,
    workKey: sourceAttempt.workKey,
  };
}

async function withDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "goodmemory-codex-ledger-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function openInput(directory: string, resume = false) {
  return {
    directory,
    identity: IDENTITY,
    resume,
    selectedWorkKeys: [WORK_KEY],
  };
}

describe("Codex coding-effect attempt and resume ledger", () => {
  it("writes run identity before returning control to an executor", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));

      expect(await readFile(join(directory, "run-identity.json"), "utf8"))
        .toBe(`${JSON.stringify(IDENTITY, null, 2)}\n`);
      await expect(readFile(join(directory, "attempts.jsonl"), "utf8"))
        .rejects.toThrow();
    });
  });

  it("requires byte-identical identity, including formatting and trailing newline", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      await writeFile(
        join(directory, "run-identity.json"),
        JSON.stringify(IDENTITY),
        "utf8",
      );

      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow("run identity bytes do not match");
    });
  });

  it("rejects identity mismatch before inspecting malformed progress", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      await writeFile(join(directory, "progress.jsonl"), "{broken\n", "utf8");
      await writeFile(
        join(directory, "run-identity.json"),
        `${JSON.stringify({ ...IDENTITY, runId: "different" }, null, 2)}\n`,
        "utf8",
      );

      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow("run identity bytes do not match");
    });
  });

  it("trims only a torn final progress line before resume", async () => {
    await withDirectory(async (directory) => {
      const ledger = await openCodexCodingEffectAttemptLedger(openInput(directory));
      await ledger.appendAttempt(attempt());
      await appendFile(join(directory, "progress.jsonl"), '{"attemptId":', "utf8");

      const resumed = await openCodexCodingEffectAttemptLedger(
        openInput(directory, true),
      );

      expect(resumed.shouldRun(WORK_KEY)).toBe(false);
      const raw = await readFile(join(directory, "progress.jsonl"), "utf8");
      expect(raw).toBe(`${serializeProgressRow(progress())}\n`);
    });
  });

  it("does not hide valid JSON with an invalid progress schema as a torn tail", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      await writeFile(join(directory, "progress.jsonl"), '{"schemaVersion":1}', "utf8");

      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow("invalid progress row at progress.jsonl:1");
    });
  });

  it("rejects duplicate terminal progress and out-of-scope work", async () => {
    await withDirectory(async (directory) => {
      const ledger = await openCodexCodingEffectAttemptLedger(openInput(directory));
      const row = attempt();
      await ledger.appendAttempt(row);
      await appendFile(
        join(directory, "progress.jsonl"),
        `${serializeProgressRow(progress(row))}\n`,
        "utf8",
      );
      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow(`duplicate terminal progress for ${WORK_KEY}`);
    });

    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      await writeFile(
        join(directory, "attempts.jsonl"),
        `${serializeAttemptRow(attempt({ workKey: OTHER_WORK_KEY }))}\n`,
        "utf8",
      );
      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow(`attempt work key is outside selected scope: ${OTHER_WORK_KEY}`);
    });
  });

  it("treats resolved=false task failure as completed and non-rerunnable", async () => {
    await withDirectory(async (directory) => {
      const ledger = await openCodexCodingEffectAttemptLedger(openInput(directory));
      await ledger.appendAttempt(attempt({ resolved: false }));

      const resumed = await openCodexCodingEffectAttemptLedger(
        openInput(directory, true),
      );
      expect(resumed.shouldRun(WORK_KEY)).toBe(false);
      expect(resumed.completed.get(WORK_KEY)?.resolved).toBe(false);
    });
  });

  it("allows infrastructure retries with deterministic next attempt ids", async () => {
    await withDirectory(async (directory) => {
      const ledger = await openCodexCodingEffectAttemptLedger(openInput(directory));
      await ledger.appendAttempt(attempt({ disposition: "infrastructure-failure" }));

      const resumed = await openCodexCodingEffectAttemptLedger(
        openInput(directory, true),
      );
      expect(resumed.shouldRun(WORK_KEY)).toBe(true);
      expect(resumed.nextAttemptId(WORK_KEY)).toBe(`${WORK_KEY}#attempt-2`);
    });
  });

  it("recovers finalized attempts missing progress without rerunning work", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      await writeFile(
        join(directory, "attempts.jsonl"),
        `${serializeAttemptRow(attempt({ resolved: false }))}\n`,
        "utf8",
      );

      const resumed = await openCodexCodingEffectAttemptLedger(
        openInput(directory, true),
      );
      expect(resumed.shouldRun(WORK_KEY)).toBe(false);
      expect(await readFile(join(directory, "progress.jsonl"), "utf8"))
        .toBe(`${serializeProgressRow(progress(attempt({ resolved: false })))}\n`);
    });
  });

  it("rejects progress that references a missing or infrastructure attempt", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      await writeFile(
        join(directory, "progress.jsonl"),
        `${serializeProgressRow(progress())}\n`,
        "utf8",
      );
      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow("progress references missing attempt");
    });

    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      const infrastructure = attempt({ disposition: "infrastructure-failure" });
      await writeFile(
        join(directory, "attempts.jsonl"),
        `${serializeAttemptRow(infrastructure)}\n`,
        "utf8",
      );
      await writeFile(
        join(directory, "progress.jsonl"),
        `${serializeProgressRow(progress({
          ...infrastructure,
          disposition: "finalized",
          result: {
            executionFailureStage: null,
            resolved: false,
            taskFailureReasons: ["hidden-fail-to-pass-failed"],
          },
        }))}\n`,
        "utf8",
      );
      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow("progress references non-finalized attempt");
    });
  });

  it("rejects duplicate attempt ids but permits multiple infrastructure attempts", async () => {
    await withDirectory(async (directory) => {
      await openCodexCodingEffectAttemptLedger(openInput(directory));
      const row = attempt({ disposition: "infrastructure-failure" });
      await writeFile(
        join(directory, "attempts.jsonl"),
        `${serializeAttemptRow(row)}\n${serializeAttemptRow(row)}\n`,
        "utf8",
      );
      await expect(openCodexCodingEffectAttemptLedger(openInput(directory, true)))
        .rejects.toThrow(`duplicate attempt id ${row.attemptId}`);
    });

    await withDirectory(async (directory) => {
      const ledger = await openCodexCodingEffectAttemptLedger(openInput(directory));
      await ledger.appendAttempt(attempt({ disposition: "infrastructure-failure" }));
      await ledger.appendAttempt(attempt({
        attemptId: `${WORK_KEY}#attempt-2`,
        disposition: "infrastructure-failure",
      }));

      const resumed = await openCodexCodingEffectAttemptLedger(
        openInput(directory, true),
      );
      expect(resumed.attempts).toHaveLength(2);
      expect(resumed.nextAttemptId(WORK_KEY)).toBe(`${WORK_KEY}#attempt-3`);
    });
  });
});
