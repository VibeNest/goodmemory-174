import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPhase74FileCheckpoint,
  phase74CheckpointPath,
} from "../../src/eval/phase74Checkpoint";

describe("Phase 74 file checkpoint", () => {
  it("round-trips committed retrieval, E4, and oracle units", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase74-checkpoint-"));
    try {
      const checkpoint = createPhase74FileCheckpoint(root);
      const snapshot = {
        evidenceLedgers: { prose: "Postgres" },
        retrievedMemories: [],
        snapshotId: "snapshot-1",
        storedMemories: [],
      };
      await checkpoint.saveRetrieval("retrieval-key", snapshot);
      await checkpoint.saveE4("e4-key", {
        answer: "Postgres",
        caseId: "case-1",
        clusterId: "conversation-1",
        contextTokens: 1,
        contextTokensBeforeTruncation: 1,
        contextTruncated: false,
        correct: true,
        format: "prose",
        score: 1,
        snapshotId: "snapshot-1",
      });
      await checkpoint.saveOracle("oracle-key", []);

      expect(await checkpoint.loadRetrieval("retrieval-key")).toEqual(snapshot);
      expect(await checkpoint.loadE4("e4-key")).toMatchObject({
        answer: "Postgres",
        correct: true,
      });
      expect(await checkpoint.loadOracle("oracle-key")).toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects conflicting commits and payload tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase74-checkpoint-"));
    try {
      const checkpoint = createPhase74FileCheckpoint(root);
      await checkpoint.saveRetrieval("same-key", {
        retrievedMemories: [],
        snapshotId: "snapshot-1",
        storedMemories: [],
      });
      await expect(checkpoint.saveRetrieval("same-key", {
        retrievedMemories: [],
        snapshotId: "snapshot-2",
        storedMemories: [],
      })).rejects.toThrow("conflicting checkpoint commit");

      const path = phase74CheckpointPath(root, "retrieval", "same-key");
      const envelope = JSON.parse(await readFile(path, "utf8"));
      envelope.payload.snapshotId = "tampered";
      await writeFile(path, JSON.stringify(envelope));
      await expect(checkpoint.loadRetrieval("same-key")).rejects.toThrow(
        "checkpoint payload hash mismatch",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
