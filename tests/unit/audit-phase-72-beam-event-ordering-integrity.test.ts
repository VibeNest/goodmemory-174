import { describe, expect, it } from "bun:test";

import {
  auditBeamEventOrderingIntegrity,
  parseRequestedBeamItemCount,
} from "../../scripts/audit-phase-72-beam-event-ordering-integrity";

describe("Phase 72 BEAM event-ordering integrity audit", () => {
  it("parses the benchmark's explicit item-count instruction", () => {
    expect(parseRequestedBeamItemCount(
      "Mention ONLY and ONLY five items.",
    )).toBe(5);
    expect(parseRequestedBeamItemCount(
      "Mention ONLY and ONLY 7 items.",
    )).toBe(7);
    expect(parseRequestedBeamItemCount(
      "List the milestones in chronological order.",
    )).toBeNull();
  });

  it("keeps a consistent chronological case eligible for the strict gate", () => {
    const audit = auditBeamEventOrderingIntegrity({
      cases: [{
        chronologicalChatIds: [4, 12, 20],
        evidenceChatIds: [4, 12, 20],
        question: "Mention ONLY and ONLY three items.",
        questionId: "1:event_ordering:1",
        questionType: "event_ordering",
      }],
      rubrics: {
        "1:event_ordering:1": {
          question: "Mention ONLY and ONLY three items.",
          rubric: ["first", "second", "third"],
        },
      },
    });

    expect(audit.summary).toEqual({
      adjacentEvidenceOrderInversions: 0,
      casesWithNonChronologicalEvidenceOrder: 0,
      casesWithRequestedRubricCountMismatch: 0,
      casesWithRequestedUniqueEvidenceCountMismatch: 0,
      strictBinaryGateEligible: true,
      totalEventOrderingCases: 1,
    });
  });

  it("marks non-chronological evidence order as a strict-gate blocker", () => {
    const audit = auditBeamEventOrderingIntegrity({
      cases: [{
        chronologicalChatIds: [4, 6, 60, 110],
        evidenceChatIds: [4, 60, 110, 6],
        question: "Mention ONLY and ONLY four items.",
        questionId: "6:event_ordering:1",
        questionType: "event_ordering",
      }],
      rubrics: {
        "6:event_ordering:1": {
          question: "Mention ONLY and ONLY four items.",
          rubric: ["first", "second", "third", "fourth"],
        },
      },
    });

    expect(audit.cases[0]?.evidenceOrderInversions).toEqual([{
      currentChatId: 6,
      currentIndex: 3,
      previousChatId: 110,
      previousIndex: 2,
    }]);
    expect(audit.summary).toMatchObject({
      adjacentEvidenceOrderInversions: 1,
      casesWithNonChronologicalEvidenceOrder: 1,
      strictBinaryGateEligible: false,
    });
  });

  it("marks a question-rubric count contradiction as a strict-gate blocker", () => {
    const audit = auditBeamEventOrderingIntegrity({
      cases: [{
        chronologicalChatIds: [44, 46, 104, 198, 200],
        evidenceChatIds: [44, 104, 198, 46, 200],
        question: "Mention ONLY and ONLY five items.",
        questionId: "14:event_ordering:2",
        questionType: "event_ordering",
      }],
      rubrics: {
        "14:event_ordering:2": {
          question: "Mention ONLY and ONLY five items.",
          rubric: ["one", "two", "three", "four", "five", "six"],
        },
      },
    });

    expect(audit.cases[0]).toMatchObject({
      requestedItemCount: 5,
      requestedRubricCountMismatch: true,
      rubricItemCount: 6,
    });
    expect(audit.summary).toMatchObject({
      casesWithRequestedRubricCountMismatch: 1,
      strictBinaryGateEligible: false,
    });
  });

  it("records evidence cardinality mismatch without treating it as a protocol contradiction", () => {
    const audit = auditBeamEventOrderingIntegrity({
      cases: [{
        chronologicalChatIds: [2, 4, 6, 8],
        evidenceChatIds: [2, 4, 6, 8],
        question: "Mention ONLY and ONLY three items.",
        questionId: "2:event_ordering:1",
        questionType: "event_ordering",
      }],
      rubrics: {
        "2:event_ordering:1": {
          question: "Mention ONLY and ONLY three items.",
          rubric: ["one", "two", "three"],
        },
      },
    });

    expect(audit.cases[0]).toMatchObject({
      requestedEvidenceCountMismatch: true,
      uniqueEvidenceCount: 4,
    });
    expect(audit.summary).toMatchObject({
      casesWithRequestedUniqueEvidenceCountMismatch: 1,
      strictBinaryGateEligible: true,
    });
  });
});
