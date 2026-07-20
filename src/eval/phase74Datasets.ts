import { createHash } from "node:crypto";

import {
  LOCOMO_MATCH_MODES,
  LOCOMO_QA_CATEGORIES,
  LOCOMO_UPSTREAM_COMMIT,
  LOCOMO_UPSTREAM_SHA256,
  LOCOMO_UPSTREAM_URL,
  normalizeLocomoDateTime,
} from "./locomo";
import type { LocomoCase } from "./locomo";
import { validateLongMemEvalCases } from "./longmemeval";
import type { LongMemEvalCase } from "./longmemeval";
import type {
  Phase74GeneralizationCase,
  Phase74RawEvidenceItem,
} from "./phase74Generalization";

export type Phase74BenchmarkFamily = "locomo" | "longmemeval";

export interface Phase74DatasetSourcePin {
  commit: string;
  license: string;
  repository: string;
  sourceSha256: string;
  sourceUrl: string;
}

export interface Phase74DatasetManifest {
  adaptedCasesSha256: string;
  benchmark: Phase74BenchmarkFamily;
  caseCount: number;
  datasetSha256: string;
  normalizedFingerprint: string;
  schemaVersion: 2;
  selectedCaseIdsSha256: string;
  source: Phase74DatasetSourcePin;
  unresolvedGoldEvidence: readonly Phase74UnresolvedGoldEvidence[];
  unresolvedGoldEvidenceCount: number;
}

export interface Phase74UnresolvedGoldEvidence {
  caseId: string;
  evidenceIds: readonly string[];
}

export interface Phase74DatasetCase extends Phase74GeneralizationCase {
  unresolvedGoldEvidenceIds: readonly string[];
}

export interface Phase74DatasetBundle {
  cases: Phase74DatasetCase[];
  manifest: Phase74DatasetManifest;
}

const LONGMEMEVAL_DATA_REVISION =
  "98d7416c24c778c2fee6e6f3006e7a073259d48f";
export const PHASE74_FROZEN_DATASET_SOURCES: Readonly<
  Record<Phase74BenchmarkFamily, Phase74DatasetSourcePin>
> = {
  longmemeval: {
    commit: LONGMEMEVAL_DATA_REVISION,
    license: "MIT",
    repository: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned",
    sourceSha256:
      "d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442",
    sourceUrl:
      `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/${LONGMEMEVAL_DATA_REVISION}/longmemeval_s_cleaned.json?download=true`,
  },
  locomo: {
    commit: LOCOMO_UPSTREAM_COMMIT,
    license: "CC BY-NC 4.0",
    repository: "https://github.com/snap-research/locomo",
    sourceSha256: LOCOMO_UPSTREAM_SHA256,
    sourceUrl: LOCOMO_UPSTREAM_URL,
  },
};

export const PHASE74_FROZEN_DATASET_EXPECTATIONS = {
  longmemeval: {
    caseCount: 500,
    memoryGroupCount: 500,
    normalizedFingerprint:
      "195fa256c468ff68079f5a05de2572deb47fa2c06b5d48e1d3ad4f3e044a5203",
    unresolvedGoldEvidenceCount: 0,
  },
  locomo: {
    caseCount: 1_986,
    memoryGroupCount: 10,
    normalizedFingerprint:
      "87abd829cbb3bd5110f80ae1df6c42338ca338b131fac48919ed171d46cb7692",
    unresolvedGoldEvidenceCount: 2,
  },
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyPhase74DatasetSource(input: {
  raw: string;
  source: Phase74DatasetSourcePin;
}): void {
  const actual = sha256(input.raw);
  if (actual !== input.source.sourceSha256) {
    throw new Error(
      `Phase 74 dataset source SHA-256 mismatch: expected ${input.source.sourceSha256}, received ${actual}.`,
    );
  }
}

export function assertPhase74FrozenDataset(
  bundle: Phase74DatasetBundle,
): void {
  const expected = PHASE74_FROZEN_DATASET_EXPECTATIONS[
    bundle.manifest.benchmark
  ];
  const source = PHASE74_FROZEN_DATASET_SOURCES[bundle.manifest.benchmark];
  if (JSON.stringify(bundle.manifest.source) !== JSON.stringify(source)) {
    throw new Error(
      `Phase 74 ${bundle.manifest.benchmark} source pin drifted.`,
    );
  }
  if (bundle.manifest.caseCount !== expected.caseCount) {
    throw new Error(
      `Phase 74 ${bundle.manifest.benchmark} population mismatch: expected ${expected.caseCount}, received ${bundle.manifest.caseCount}.`,
    );
  }
  if (bundle.manifest.normalizedFingerprint !== expected.normalizedFingerprint) {
    throw new Error(
      `Phase 74 ${bundle.manifest.benchmark} normalized fingerprint mismatch.`,
    );
  }
  if (
    bundle.manifest.unresolvedGoldEvidenceCount !==
      expected.unresolvedGoldEvidenceCount
  ) {
    throw new Error(
      `Phase 74 ${bundle.manifest.benchmark} unresolved gold-evidence count mismatch: expected ${expected.unresolvedGoldEvidenceCount}, received ${bundle.manifest.unresolvedGoldEvidenceCount}.`,
    );
  }
  const memoryGroupCount = new Set(
    bundle.cases.map(({ caseId, memoryGroupId }) => memoryGroupId ?? caseId),
  ).size;
  if (memoryGroupCount !== expected.memoryGroupCount) {
    throw new Error(
      `Phase 74 ${bundle.manifest.benchmark} memory-group population mismatch: expected ${expected.memoryGroupCount}, received ${memoryGroupCount}.`,
    );
  }
}

function manifest(input: {
  benchmark: Phase74BenchmarkFamily;
  cases: readonly Phase74DatasetCase[];
  datasetRaw: string;
  normalizedFingerprint: string;
  source: Phase74DatasetSourcePin;
}): Phase74DatasetManifest {
  return caseBoundManifest({
    benchmark: input.benchmark,
    cases: input.cases,
    datasetSha256: sha256(input.datasetRaw),
    normalizedFingerprint: input.normalizedFingerprint,
    source: input.source,
  });
}

function caseBoundManifest(input: {
  benchmark: Phase74BenchmarkFamily;
  cases: readonly Phase74DatasetCase[];
  datasetSha256: string;
  normalizedFingerprint: string;
  source: Phase74DatasetSourcePin;
}): Phase74DatasetManifest {
  const unresolvedGoldEvidence = input.cases.flatMap((testCase) =>
    testCase.unresolvedGoldEvidenceIds.length === 0
      ? []
      : [{
        caseId: testCase.caseId,
        evidenceIds: [...testCase.unresolvedGoldEvidenceIds],
      }]
  );
  return {
    adaptedCasesSha256: sha256(JSON.stringify(input.cases)),
    benchmark: input.benchmark,
    caseCount: input.cases.length,
    datasetSha256: input.datasetSha256,
    normalizedFingerprint: input.normalizedFingerprint,
    schemaVersion: 2,
    selectedCaseIdsSha256: sha256(
      JSON.stringify(input.cases.map(({ caseId }) => caseId)),
    ),
    source: { ...input.source },
    unresolvedGoldEvidence,
    unresolvedGoldEvidenceCount: unresolvedGoldEvidence.reduce(
      (count, item) => count + item.evidenceIds.length,
      0,
    ),
  };
}

export function createPhase74SelectedDatasetBundle(input: {
  bundle: Phase74DatasetBundle;
  cases: readonly Phase74DatasetCase[];
}): Phase74DatasetBundle {
  const cases = [...input.cases];
  return {
    cases,
    manifest: caseBoundManifest({
      benchmark: input.bundle.manifest.benchmark,
      cases,
      datasetSha256: input.bundle.manifest.datasetSha256,
      normalizedFingerprint: input.bundle.manifest.normalizedFingerprint,
      source: input.bundle.manifest.source,
    }),
  };
}

function longMemEvalEvidence(testCase: LongMemEvalCase): Phase74RawEvidenceItem[] {
  return testCase.haystackSessions.flatMap((session, sessionIndex) => {
    const sessionId = testCase.haystackSessionIds[sessionIndex] ??
      `session-${sessionIndex + 1}`;
    const observedAt = testCase.haystackDates[sessionIndex];
    return session.map((turn, turnIndex) => ({
      content: `${observedAt ? `[${observedAt}] ` : ""}${turn.role}: ${turn.content}`,
      id: `${testCase.questionId}/${sessionId}/turn-${turnIndex + 1}`,
      ...(observedAt === undefined ? {} : { observedAt }),
      role: turn.role,
      sourceIds: [sessionId],
    }));
  });
}

function adaptLongMemEvalCase(
  testCase: LongMemEvalCase,
): Phase74DatasetCase {
  const sessionIds = new Set(testCase.haystackSessionIds);
  return {
    caseId: testCase.questionId,
    expectedAnswer: testCase.answer,
    family: "longmemeval",
    goldEvidenceIds: [...testCase.answerSessionIds],
    locale: "en",
    memoryGroupId: testCase.questionId,
    protocolMetadata: { questionType: testCase.questionType },
    question: testCase.question,
    rawEvidence: longMemEvalEvidence(testCase),
    referenceTime: testCase.questionDate,
    unresolvedGoldEvidenceIds: testCase.answerSessionIds.filter(
      (sessionId) => !sessionIds.has(sessionId),
    ),
  };
}

export function createPhase74LongMemEvalDataset(input: {
  raw: string;
  source?: Phase74DatasetSourcePin;
}): Phase74DatasetBundle {
  const source = input.source ?? PHASE74_FROZEN_DATASET_SOURCES.longmemeval;
  verifyPhase74DatasetSource({ raw: input.raw, source });
  const parsed = JSON.parse(input.raw) as unknown;
  const cases = validateLongMemEvalCases(parsed).map(
    adaptLongMemEvalCase,
  );
  return {
    cases,
    manifest: manifest({
      benchmark: "longmemeval",
      cases,
      datasetRaw: input.raw,
      normalizedFingerprint: sha256(JSON.stringify(parsed)),
      source,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readLocomoCases(normalizedRaw: string): LocomoCase[] {
  const parsed = JSON.parse(normalizedRaw) as unknown;
  const rawCases = isRecord(parsed) ? parsed.cases : parsed;
  if (!Array.isArray(rawCases)) {
    throw new Error("Phase 74 LoCoMo dataset must contain a cases array.");
  }
  return rawCases.map((value, index) => {
    if (
      !isRecord(value) ||
      typeof value.caseId !== "string" ||
      typeof value.sourceConversation !== "string" ||
      !Array.isArray(value.turns) ||
      !Array.isArray(value.questions)
    ) {
      throw new Error(`Invalid normalized LoCoMo case at index ${index}.`);
    }
    for (const turn of value.turns) {
      if (
        !isRecord(turn) ||
        typeof turn.content !== "string" ||
        typeof turn.diaId !== "string" ||
        typeof turn.speaker !== "string"
      ) {
        throw new Error(`Invalid normalized LoCoMo turn in case ${value.caseId}.`);
      }
    }
    for (const question of value.questions) {
      if (
        !isRecord(question) ||
        typeof question.questionId !== "string" ||
        typeof question.question !== "string" ||
        typeof question.goldAnswer !== "string" ||
        !Array.isArray(question.evidenceTurnIds) ||
        !LOCOMO_QA_CATEGORIES.includes(question.category as never) ||
        !LOCOMO_MATCH_MODES.includes(question.matchMode as never)
      ) {
        throw new Error(
          `Invalid normalized LoCoMo question in case ${value.caseId}.`,
        );
      }
    }
    return value as unknown as LocomoCase;
  });
}

function locomoEvidence(testCase: LocomoCase): Phase74RawEvidenceItem[] {
  return testCase.turns.map((turn) => {
    const diaId = normalizeLocomoDialogueId(turn.diaId);
    const observedAt = turn.date === undefined
      ? undefined
      : normalizeLocomoDateTime(turn.date);
    return {
      content: `${observedAt ? `[${observedAt}] ` : ""}${turn.speaker}: ${turn.content}`,
      id: `${testCase.caseId}/${diaId}`,
      ...(observedAt === undefined ? {} : { observedAt }),
      role: "user",
      sourceIds: [diaId],
    };
  });
}

function normalizeLocomoDialogueId(value: string): string {
  const match = /^D(\d+):(\d+)$/.exec(value);
  if (match === null) {
    return value;
  }
  return `D${Number(match[1])}:${Number(match[2])}`;
}

function locomoReferenceTime(
  rawEvidence: readonly Phase74RawEvidenceItem[],
): string | undefined {
  let latest: string | undefined;
  for (const item of rawEvidence) {
    if (
      item.observedAt !== undefined &&
      (latest === undefined || item.observedAt > latest)
    ) {
      latest = item.observedAt;
    }
  }
  return latest;
}

export function createPhase74LocomoDataset(input: {
  normalizedRaw: string;
  source?: Phase74DatasetSourcePin;
}): Phase74DatasetBundle {
  const source = input.source ?? PHASE74_FROZEN_DATASET_SOURCES.locomo;
  const parsed = JSON.parse(input.normalizedRaw) as unknown;
  const normalizedCases = readLocomoCases(input.normalizedRaw);
  const cases = normalizedCases.flatMap((testCase) => {
    const rawEvidence = locomoEvidence(testCase);
    const rawEvidenceIds = new Set(
      rawEvidence.flatMap(({ sourceIds }) => sourceIds),
    );
    const referenceTime = locomoReferenceTime(rawEvidence);
    return testCase.questions.map((question): Phase74DatasetCase => {
      const goldEvidenceIds = question.evidenceTurnIds.map(
        normalizeLocomoDialogueId,
      );
      return {
        caseId: `${testCase.caseId}/${question.questionId}`,
        expectedAnswer: question.goldAnswer,
        family: "locomo",
        goldEvidenceIds,
        locale: "en",
        memoryGroupId: testCase.sourceConversation,
        protocolMetadata: {
          adversarialAnswer: question.adversarialAnswer,
          category: question.category,
          matchMode: question.matchMode,
        },
        question: question.question,
        rawEvidence,
        ...(referenceTime === undefined ? {} : { referenceTime }),
        unresolvedGoldEvidenceIds: goldEvidenceIds.filter(
          (evidenceId) => !rawEvidenceIds.has(evidenceId),
        ),
      };
    });
  });
  return {
    cases,
    manifest: manifest({
      benchmark: "locomo",
      cases,
      datasetRaw: input.normalizedRaw,
      normalizedFingerprint: sha256(stableJson(parsed)),
      source,
    }),
  };
}
