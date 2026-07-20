import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  Phase74E4CaseResult,
  Phase74GeneralizationCheckpoint,
  Phase74RetrievalSnapshot,
} from "./phase74Generalization";
import type { OracleMatrixCaseResult } from "./oracleMatrix";

type Phase74CheckpointKind = "e4" | "oracle" | "retrieval";

interface Phase74CheckpointEnvelope {
  key: string;
  kind: Phase74CheckpointKind;
  payload: unknown;
  payloadSha256: string;
  schemaVersion: 1;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function phase74CheckpointPath(
  root: string,
  kind: Phase74CheckpointKind,
  key: string,
): string {
  return join(root, kind, `${sha256(key)}.json`);
}

function parseEnvelope(input: {
  key: string;
  kind: Phase74CheckpointKind;
  path: string;
  raw: string;
}): Phase74CheckpointEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(input.raw);
  } catch {
    throw new Error(`Invalid Phase 74 checkpoint JSON at ${input.path}.`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`Invalid Phase 74 checkpoint at ${input.path}.`);
  }
  const envelope = value as Partial<Phase74CheckpointEnvelope>;
  if (
    envelope.schemaVersion !== 1 ||
    envelope.key !== input.key ||
    envelope.kind !== input.kind ||
    typeof envelope.payloadSha256 !== "string"
  ) {
    throw new Error(`Phase 74 checkpoint identity mismatch at ${input.path}.`);
  }
  const payloadRaw = JSON.stringify(envelope.payload);
  if (sha256(payloadRaw) !== envelope.payloadSha256) {
    throw new Error(`Phase 74 checkpoint payload hash mismatch at ${input.path}.`);
  }
  return envelope as Phase74CheckpointEnvelope;
}

async function readCheckpoint(input: {
  key: string;
  kind: Phase74CheckpointKind;
  root: string;
}): Promise<Phase74CheckpointEnvelope | null> {
  const path = phase74CheckpointPath(input.root, input.kind, input.key);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return parseEnvelope({ ...input, path, raw });
}

async function saveCheckpoint(input: {
  key: string;
  kind: Phase74CheckpointKind;
  payload: unknown;
  root: string;
}): Promise<void> {
  const path = phase74CheckpointPath(input.root, input.kind, input.key);
  const payloadRaw = JSON.stringify(input.payload);
  const envelope: Phase74CheckpointEnvelope = {
    key: input.key,
    kind: input.kind,
    payload: input.payload,
    payloadSha256: sha256(payloadRaw),
    schemaVersion: 1,
  };
  await mkdir(join(input.root, input.kind), { recursive: true });
  try {
    await writeFile(path, `${JSON.stringify(envelope)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    const existing = await readCheckpoint(input);
    if (
      existing === null ||
      existing.payloadSha256 !== envelope.payloadSha256
    ) {
      throw new Error(
        `Phase 74 ${input.kind} has a conflicting checkpoint commit for ${input.key}.`,
      );
    }
  }
}

export function createPhase74FileCheckpoint(
  root: string,
): Phase74GeneralizationCheckpoint {
  return {
    async loadE4(key): Promise<Phase74E4CaseResult | null> {
      return (await readCheckpoint({ key, kind: "e4", root }))
        ?.payload as Phase74E4CaseResult | undefined ?? null;
    },
    async loadOracle(key): Promise<readonly OracleMatrixCaseResult[] | null> {
      return (await readCheckpoint({ key, kind: "oracle", root }))
        ?.payload as OracleMatrixCaseResult[] | undefined ?? null;
    },
    async loadRetrieval(key): Promise<Phase74RetrievalSnapshot | null> {
      return (await readCheckpoint({ key, kind: "retrieval", root }))
        ?.payload as Phase74RetrievalSnapshot | undefined ?? null;
    },
    async saveE4(key, payload): Promise<void> {
      await saveCheckpoint({ key, kind: "e4", payload, root });
    },
    async saveOracle(key, payload): Promise<void> {
      await saveCheckpoint({ key, kind: "oracle", payload, root });
    },
    async saveRetrieval(key, payload): Promise<void> {
      await saveCheckpoint({ key, kind: "retrieval", payload, root });
    },
  };
}
