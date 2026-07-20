import { createHash } from "node:crypto";

import { describe, expect, it } from "bun:test";

import {
  createPhase74LocomoDataset,
  createPhase74LongMemEvalDataset,
  createPhase74SelectedDatasetBundle,
  PHASE74_FROZEN_DATASET_SOURCES,
  verifyPhase74DatasetSource,
} from "../../src/eval/phase74Datasets";
import type { Phase74DatasetSourcePin } from "../../src/eval/phase74Datasets";
import {
  LOCOMO_UPSTREAM_COMMIT,
  LOCOMO_UPSTREAM_SHA256,
  LOCOMO_UPSTREAM_URL,
} from "../../src/eval/locomo";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const source: Phase74DatasetSourcePin = {
  commit: "test-commit",
  license: "test-only",
  repository: "https://example.test/benchmark",
  sourceSha256: "unused",
  sourceUrl: "https://example.test/benchmark/data.json",
};

describe("Phase 74 frozen dataset adapters", () => {
  it("uses the shared canonical LoCoMo source pin", () => {
    expect(PHASE74_FROZEN_DATASET_SOURCES.locomo).toMatchObject({
      commit: LOCOMO_UPSTREAM_COMMIT,
      sourceSha256: LOCOMO_UPSTREAM_SHA256,
      sourceUrl: LOCOMO_UPSTREAM_URL,
    });
  });

  it("adapts exact LongMemEval bytes and preserves session evidence without exposing labels in raw items", () => {
    const raw = JSON.stringify([{
      answer: "Postgres",
      answer_session_ids: ["session-2"],
      haystack_dates: ["2026-01-01", "2026-02-01"],
      haystack_session_ids: ["session-1", "session-2"],
      haystack_sessions: [
        [{ role: "user", content: "We use SQLite." }],
        [{ role: "user", content: "We migrated to Postgres." }],
      ],
      question: "Which database is current?",
      question_date: "2026-02-02",
      question_id: "question-1",
      question_type: "knowledge-update",
    }]);
    const bundle = createPhase74LongMemEvalDataset({
      raw,
      source: { ...source, sourceSha256: sha256(raw) },
    });

    expect(bundle.manifest).toMatchObject({
      benchmark: "longmemeval",
      caseCount: 1,
      datasetSha256: sha256(raw),
      schemaVersion: 2,
      source: { sourceSha256: sha256(raw) },
      unresolvedGoldEvidence: [],
      unresolvedGoldEvidenceCount: 0,
    });
    expect(bundle.cases[0]).toMatchObject({
      caseId: "question-1",
      expectedAnswer: "Postgres",
      goldEvidenceIds: ["session-2"],
      referenceTime: "2026-02-02",
      unresolvedGoldEvidenceIds: [],
    });
    expect(bundle.cases[0]?.rawEvidence).toEqual([
      {
        content: "[2026-01-01] user: We use SQLite.",
        id: "question-1/session-1/turn-1",
        observedAt: "2026-01-01",
        role: "user",
        sourceIds: ["session-1"],
      },
      {
        content: "[2026-02-01] user: We migrated to Postgres.",
        id: "question-1/session-2/turn-1",
        observedAt: "2026-02-01",
        role: "user",
        sourceIds: ["session-2"],
      },
    ]);
  });

  it("flattens every LoCoMo question into an independent evaluation case", () => {
    const raw = JSON.stringify({
      cases: [{
        caseId: "locomo-conversation-1",
        sourceConversation: "conversation-1",
        speakers: ["Caroline", "Melanie"],
        turns: [
          {
            content: "I adopted Pepper.",
            date: "1:56 pm on 8 May, 2023",
            diaId: "D1:1",
            speaker: "Caroline",
          },
          {
            content: "Pepper is a beagle.",
            date: "10:04 am on 19 June, 2023",
            diaId: "D2:1",
            speaker: "Caroline",
          },
        ],
        questions: [
          {
            adversarialAnswer: null,
            category: "single_hop",
            evidenceTurnIds: ["D1:1"],
            goldAnswer: "Pepper",
            matchMode: "f1_token_overlap",
            question: "What is the dog's name?",
            questionId: "q1",
          },
          {
            adversarialAnswer: null,
            category: "multi_hop",
            evidenceTurnIds: ["D1:1", "D2:1"],
            goldAnswer: "a beagle named Pepper",
            matchMode: "f1_token_overlap",
            question: "What kind of dog did Caroline adopt?",
            questionId: "q2",
          },
        ],
      }],
    });
    const bundle = createPhase74LocomoDataset({
      normalizedRaw: raw,
      source: { ...source, sourceSha256: "upstream-source-sha" },
    });

    expect(bundle.manifest).toMatchObject({
      benchmark: "locomo",
      caseCount: 2,
      datasetSha256: sha256(raw),
      source: { sourceSha256: "upstream-source-sha" },
    });
    expect(bundle.cases.map(({ caseId }) => caseId)).toEqual([
      "locomo-conversation-1/q1",
      "locomo-conversation-1/q2",
    ]);
    expect(bundle.cases[1]).toMatchObject({
      goldEvidenceIds: ["D1:1", "D2:1"],
      protocolMetadata: {
        category: "multi_hop",
        matchMode: "f1_token_overlap",
      },
      referenceTime: "2023-06-19T10:04:00.000Z",
    });
    expect(bundle.cases[0]?.rawEvidence[0]).toEqual({
      content: "[2023-05-08T13:56:00.000Z] Caroline: I adopted Pepper.",
      id: "locomo-conversation-1/D1:1",
      observedAt: "2023-05-08T13:56:00.000Z",
      role: "user",
      sourceIds: ["D1:1"],
    });
  });

  it("fails closed on malformed LoCoMo session timestamps", () => {
    const raw = JSON.stringify({
      cases: [{
        caseId: "locomo-conversation-1",
        questions: [{
          adversarialAnswer: null,
          category: "single_hop",
          evidenceTurnIds: ["D1:1"],
          goldAnswer: "Pepper",
          matchMode: "f1_token_overlap",
          question: "What is the dog's name?",
          questionId: "q1",
        }],
        sourceConversation: "conversation-1",
        speakers: ["Caroline", "Melanie"],
        turns: [{
          content: "I adopted Pepper.",
          date: "31 February 2023",
          diaId: "D1:1",
          speaker: "Caroline",
        }],
      }],
    });

    expect(() => createPhase74LocomoDataset({
      normalizedRaw: raw,
      source: { ...source, sourceSha256: "upstream-source-sha" },
    })).toThrow("Invalid LoCoMo date/time");
  });

  it("normalizes numeric dialogue-id fields and records upstream-missing gold evidence", () => {
    const locomoCase = (input: {
      caseId: string;
      evidenceTurnId: string;
      questionId: string;
      turnId: string;
    }) => ({
      caseId: input.caseId,
      questions: [{
        adversarialAnswer: null,
        category: "single_hop",
        evidenceTurnIds: [input.evidenceTurnId],
        goldAnswer: "answer",
        matchMode: "f1_token_overlap",
        question: "question",
        questionId: input.questionId,
      }],
      sourceConversation: input.caseId,
      speakers: ["A", "B"],
      turns: [{
        content: "evidence",
        diaId: input.turnId,
        speaker: "A",
      }],
    });
    const raw = JSON.stringify({
      cases: [
        locomoCase({
          caseId: "locomo-conv-42",
          evidenceTurnId: "D10:19",
          questionId: "conv-42:q58",
          turnId: "D10:16",
        }),
        locomoCase({
          caseId: "locomo-conv-47",
          evidenceTurnId: "D4:36",
          questionId: "conv-47:q38",
          turnId: "D4:35",
        }),
        locomoCase({
          caseId: "locomo-conv-50",
          evidenceTurnId: "D30:05",
          questionId: "conv-50:q69",
          turnId: "D30:5",
        }),
      ],
    });

    const bundle = createPhase74LocomoDataset({
      normalizedRaw: raw,
      source: { ...source, sourceSha256: "upstream-source-sha" },
    });

    expect(bundle.cases.map((testCase) => ({
      caseId: testCase.caseId,
      goldEvidenceIds: testCase.goldEvidenceIds,
      unresolvedGoldEvidenceIds: testCase.unresolvedGoldEvidenceIds,
    }))).toEqual([
      {
        caseId: "locomo-conv-42/conv-42:q58",
        goldEvidenceIds: ["D10:19"],
        unresolvedGoldEvidenceIds: ["D10:19"],
      },
      {
        caseId: "locomo-conv-47/conv-47:q38",
        goldEvidenceIds: ["D4:36"],
        unresolvedGoldEvidenceIds: ["D4:36"],
      },
      {
        caseId: "locomo-conv-50/conv-50:q69",
        goldEvidenceIds: ["D30:5"],
        unresolvedGoldEvidenceIds: [],
      },
    ]);
    expect(bundle.manifest).toMatchObject({
      schemaVersion: 2,
      unresolvedGoldEvidence: [
        {
          caseId: "locomo-conv-42/conv-42:q58",
          evidenceIds: ["D10:19"],
        },
        {
          caseId: "locomo-conv-47/conv-47:q38",
          evidenceIds: ["D4:36"],
        },
      ],
      unresolvedGoldEvidenceCount: 2,
    });
  });

  it("fails closed when downloaded source bytes drift from the frozen pin", () => {
    expect(() => verifyPhase74DatasetSource({
      raw: "changed",
      source: { ...source, sourceSha256: sha256("expected") },
    })).toThrow("source SHA-256 mismatch");
  });

  it("creates a case-consistent run manifest for a deterministic subset", () => {
    const raw = JSON.stringify(Array.from({ length: 3 }, (_, index) => ({
      answer: `answer-${index}`,
      answer_session_ids: [`session-${index}`],
      haystack_dates: ["2026-01-01"],
      haystack_session_ids: [`session-${index}`],
      haystack_sessions: [[{ role: "user", content: `evidence-${index}` }]],
      question: `question-${index}`,
      question_date: "2026-01-02",
      question_id: `question-${index}`,
      question_type: "single-session-user",
    })));
    const full = createPhase74LongMemEvalDataset({
      raw,
      source: { ...source, sourceSha256: sha256(raw) },
    });
    const selected = createPhase74SelectedDatasetBundle({
      bundle: full,
      cases: [full.cases[1]!],
    });

    expect(selected.cases.map(({ caseId }) => caseId)).toEqual(["question-1"]);
    expect(selected.manifest).toMatchObject({
      caseCount: 1,
      datasetSha256: full.manifest.datasetSha256,
      selectedCaseIdsSha256: sha256(JSON.stringify(["question-1"])),
      unresolvedGoldEvidence: [],
      unresolvedGoldEvidenceCount: 0,
    });
    expect(selected.manifest.adaptedCasesSha256).toBe(
      sha256(JSON.stringify(selected.cases)),
    );
  });
});
