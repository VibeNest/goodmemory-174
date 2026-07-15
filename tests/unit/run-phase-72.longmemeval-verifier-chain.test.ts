import { describe, expect, it } from "bun:test";

import {
  admitPhase72LongMemEvalVerifierResponse,
  buildPhase72LongMemEvalVerifierPrompt,
  isPhase72LongMemEvalVerifierStageCase,
  parsePhase72LongMemEvalVerifierChainOptions,
  parsePhase72LongMemEvalVerifierProgress,
  PHASE72_LONGMEMEVAL_VERIFIER_CANDIDATE_STAGES,
  PHASE72_LONGMEMEVAL_VERIFIER_STAGES,
  resolvePhase72LongMemEvalVerifierAttempts,
  trimPhase72LongMemEvalVerifierTornTail,
} from "../../scripts/run-phase-72-longmemeval-verifier-chain";
import type {
  Phase72LongMemEvalVerifierResponse,
  Phase72LongMemEvalVerifierStage,
} from "../../scripts/run-phase-72-longmemeval-verifier-chain";
import type {
  LongMemEvalCase,
  LongMemEvalCaseResult,
} from "../../src/eval/longmemeval";

function buildTestCase(
  questionType = "single-session-assistant",
): LongMemEvalCase {
  return {
    answer: "GOLD_ONLY_SECRET",
    answerSessionIds: ["GOLD_SESSION_SECRET"],
    haystackDates: ["2026-01-01", "2026-01-08", "2026-01-10"],
    haystackSessionIds: ["session-a", "session-b", "session-noise"],
    haystackSessions: [
      [
        {
          content: "I prefer a compact keyboard for travel.",
          role: "user",
        },
        {
          content: 'The exact pattern is C D E F G A B A G F E D C and the body is "blue".',
          role: "assistant",
        },
      ],
      [
        {
          content: "The compact keyboard worked well on my last trip.",
          role: "user",
        },
        {
          content: "The router was installed after the thermostat.",
          role: "assistant",
        },
      ],
      [
        {
          content: "GOLD_ONLY_SECRET must never enter a verifier prompt.",
          role: "assistant",
        },
      ],
    ],
    question: "What exact pattern was stated?",
    questionDate: "2026-01-11",
    questionId: "question-1",
    questionType,
  };
}

function buildCaseResult(input: {
  hypothesis?: string;
  questionType?: string;
} = {}): LongMemEvalCaseResult {
  return {
    answerSessionIds: ["GOLD_SESSION_SECRET"],
    correct: false,
    evidenceSessionRecall: 1,
    hypothesis: input.hypothesis ?? "No answer",
    questionId: "question-1",
    questionType: input.questionType ?? "single-session-assistant",
    retrievedSessionIds: ["session-a", "session-b"],
  };
}

function buildResponse(
  overrides: Partial<Phase72LongMemEvalVerifierResponse> = {},
): Phase72LongMemEvalVerifierResponse {
  return {
    answer: "The pattern was C D E F G A B A G F E D C.",
    decision: "revise",
    evidenceQuotes: [],
    reason: "The retrieved evidence directly supports the answer.",
    supportSessionIds: ["session-a"],
    timeline: [],
    ...overrides,
  };
}

function buildProgressOutcome() {
  const response = buildResponse({
    answer: "2 AM",
    decision: "answer",
    supportSessionIds: ["session-a", "session-b"],
  });
  return {
    admission: {
      accepted: true,
      enoughSupport: true,
      quoteSupported: true,
      revisableSourceShape: true,
      validSupport: true,
      validTimeline: true,
    },
    agreeingAttempts: 2,
    attempts: [
      { executionFailure: false, response },
      { executionFailure: false, response },
      {
        executionFailure: false,
        response: { ...response, decision: "keep_abstention" as const },
      },
    ],
    chosenAnswer: "2 AM",
    executionFailure: false,
    questionId: "question-1",
    response,
    sourceAnswer: "No answer",
    stage: "abstention" as const,
  };
}

describe("Phase 72 LongMemEval verifier chain", () => {
  it("requires an explicit source and defaults to the admitted verifier stages", () => {
    expect(() => parsePhase72LongMemEvalVerifierChainOptions(
      ["bun", "run-phase-72-longmemeval-verifier-chain.ts"],
      "/repo",
      "/cache",
    )).toThrow(
      "Phase 72 LongMemEval verifier chain requires --source-report.",
    );
    expect(parsePhase72LongMemEvalVerifierChainOptions(
      [
        "bun",
        "run-phase-72-longmemeval-verifier-chain.ts",
        "--source-report",
        "/evidence/source-report.json",
      ],
      "/repo",
      "/cache",
    )).toEqual({
      benchmarkRoot: "/cache/LongMemEval",
      maxConcurrency: 40,
      outputDir: "/repo/reports/eval/research/phase-72/longmemeval",
      runId:
        "run-phase72-longmemeval-verifier-chain-consensus-full500-terra-v8",
      sourceReportPath: "/evidence/source-report.json",
      stages: [
        "abstention",
        "assistant-detail",
        "preference",
      ],
      workDir: "/cache/phase72-runs/longmemeval-verifier-chain",
    });
    expect(PHASE72_LONGMEMEVAL_VERIFIER_STAGES).toEqual([
      "abstention",
      "assistant-detail",
      "preference",
    ]);
    expect(PHASE72_LONGMEMEVAL_VERIFIER_CANDIDATE_STAGES).toEqual([
      "abstention",
      "knowledge-update",
      "assistant-detail",
      "timeline",
      "preference",
    ]);
    expect(parsePhase72LongMemEvalVerifierChainOptions(
      [
        "bun",
        "run-phase-72-longmemeval-verifier-chain.ts",
        "--source-report",
        "/evidence/source-report.json",
        "--stages",
        "preference,assistant-detail",
      ],
      "/repo",
      "/cache",
    ).stages).toEqual([
      "preference",
      "assistant-detail",
    ]);
    expect(() => parsePhase72LongMemEvalVerifierChainOptions(
      [
        "bun",
        "run-phase-72-longmemeval-verifier-chain.ts",
        "--source-report",
        "/evidence/source-report.json",
        "--stages",
        "unknown-stage",
      ],
      "/repo",
      "/cache",
    )).toThrow("--stages contains unsupported stage unknown-stage");
  });

  it("rejects duplicate completed checkpoint rows", () => {
    const line = JSON.stringify(buildProgressOutcome());

    expect(() => parsePhase72LongMemEvalVerifierProgress(`${line}\n${line}\n`))
      .toThrow("duplicate completed entry abstention:question-1");
  });

  it("tolerates only a torn final checkpoint line", () => {
    const line = JSON.stringify(buildProgressOutcome());
    const torn = `${line}\n{\"questionId\":`;

    expect(
      parsePhase72LongMemEvalVerifierProgress(torn).size,
    ).toBe(1);
    expect(trimPhase72LongMemEvalVerifierTornTail(torn)).toBe(`${line}\n`);
    expect(trimPhase72LongMemEvalVerifierTornTail(line)).toBe(line);
    expect(() =>
      parsePhase72LongMemEvalVerifierProgress(`${line}\n{\"questionId\":\n`)
    ).toThrow("invalid entry at line 2");
  });

  it("rejects structurally or semantically inconsistent checkpoint rows", () => {
    const malformed = {
      ...buildProgressOutcome(),
      attempts: [{ executionFailure: true, response: buildResponse() }],
    };

    expect(() =>
      parsePhase72LongMemEvalVerifierProgress(`${JSON.stringify(malformed)}\n`)
    ).toThrow("executionFailure does not match its attempts");
  });

  it("routes cases only by current answer shape or public question type", () => {
    const abstention = buildCaseResult({
      hypothesis: "No answer.",
      questionType: "single-session-user",
    });
    expect(isPhase72LongMemEvalVerifierStageCase("abstention", abstention)).toBe(true);
    expect(isPhase72LongMemEvalVerifierStageCase("assistant-detail", abstention)).toBe(false);
    expect(isPhase72LongMemEvalVerifierStageCase(
      "abstention",
      buildCaseResult({
        hypothesis: "No exact current value is recorded.",
        questionType: "knowledge-update",
      }),
    )).toBe(true);

    const cases: Array<[Phase72LongMemEvalVerifierStage, string]> = [
      ["knowledge-update", "knowledge-update"],
      ["assistant-detail", "single-session-assistant"],
      ["timeline", "temporal-reasoning"],
      ["preference", "single-session-preference"],
    ];
    for (const [stage, questionType] of cases) {
      expect(isPhase72LongMemEvalVerifierStageCase(
        stage,
        buildCaseResult({ hypothesis: "Existing answer", questionType }),
      )).toBe(true);
    }
  });

  it("never exposes gold answers, answer-session labels, or unretrieved sessions", () => {
    const testCase = buildTestCase();
    const prompt = buildPhase72LongMemEvalVerifierPrompt({
      currentAnswer: "No answer",
      retrievedSessionIds: ["session-a", "session-b"],
      stage: "assistant-detail",
      testCase,
    });
    expect(prompt).not.toContain(testCase.answer);
    expect(prompt).not.toContain(testCase.answerSessionIds[0]!);
    expect(prompt).not.toContain("session-noise");
    expect(prompt).toContain("session-a");
    expect(prompt).toContain("Current answer: No answer");
  });

  it("gives preference verification a general answer-completeness contract", () => {
    const prompt = buildPhase72LongMemEvalVerifierPrompt({
      currentAnswer: "Buy now if the known condition is true.",
      retrievedSessionIds: ["session-a", "session-b"],
      stage: "preference",
      testCase: buildTestCase("single-session-preference"),
    });
    expect(prompt).toContain("make a concrete recommendation");
    expect(prompt).toContain("current item and a contemplated replacement");
    expect(prompt).toContain("at least one concrete actionable step");
    expect(prompt).not.toContain("GOLD_ONLY_SECRET");

  });

  it("admits an abstention repair only with retrieved support and a concrete answer", () => {
    const input = {
      executionFailure: false,
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "No answer",
      stage: "abstention" as const,
      testCase: buildTestCase("single-session-user"),
    };
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...input,
      response: buildResponse({ decision: "answer" }),
    }).accepted).toBe(true);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...input,
      response: buildResponse({
        answer: "No answer",
        decision: "answer",
      }),
    }).accepted).toBe(false);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...input,
      response: buildResponse({
        answer: "Not enough information to determine the value.",
        decision: "answer",
      }),
    }).accepted).toBe(false);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...input,
      response: buildResponse({
        decision: "answer",
        supportSessionIds: ["session-noise"],
      }),
    }).accepted).toBe(false);
  });

  it("requires two independently supported matching abstention repairs", () => {
    const input = {
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "No answer",
      stage: "abstention" as const,
      testCase: buildTestCase("single-session-user"),
    };
    const agreeing = buildResponse({
      answer: "2 AM",
      decision: "answer",
      supportSessionIds: ["session-a", "session-b"],
    });
    const keep = buildResponse({
      answer: "No answer",
      decision: "keep_abstention",
      supportSessionIds: [],
    });
    const accepted = resolvePhase72LongMemEvalVerifierAttempts({
      ...input,
      attempts: [
        { executionFailure: false, response: agreeing },
        { executionFailure: false, response: keep },
        {
          executionFailure: false,
          response: { ...agreeing, answer: "  2   AM  " },
        },
      ],
    });
    expect(accepted.agreeingAttempts).toBe(2);
    expect(accepted.admission.accepted).toBe(true);
    expect(accepted.chosenAnswer).toBe("2 AM");

    const paraphrased = resolvePhase72LongMemEvalVerifierAttempts({
      ...input,
      attempts: [
        {
          executionFailure: false,
          response: { ...agreeing, answer: "Yes, four times a week, up from three." },
        },
        {
          executionFailure: false,
          response: {
            ...agreeing,
            answer: "Four times a week now, up from three times a week previously.",
          },
        },
        {
          executionFailure: false,
          response: { ...agreeing, answer: "It is now four times weekly, up from three." },
        },
      ],
    });
    expect(paraphrased.agreeingAttempts).toBe(3);
    expect(paraphrased.admission.accepted).toBe(true);

    const split = resolvePhase72LongMemEvalVerifierAttempts({
      ...input,
      attempts: [
        { executionFailure: false, response: agreeing },
        {
          executionFailure: false,
          response: { ...agreeing, answer: "3 AM" },
        },
        { executionFailure: false, response: keep },
      ],
    });
    expect(split.agreeingAttempts).toBe(1);
    expect(split.admission.accepted).toBe(false);
    expect(split.chosenAnswer).toBe("No answer");

    const conflictingValues = resolvePhase72LongMemEvalVerifierAttempts({
      ...input,
      attempts: [
        {
          executionFailure: false,
          response: { ...agreeing, answer: "Four times a week." },
        },
        {
          executionFailure: false,
          response: { ...agreeing, answer: "Five times a week." },
        },
        {
          executionFailure: false,
          response: { ...agreeing, answer: "Six times a week." },
        },
      ],
    });
    expect(conflictingValues.admission.accepted).toBe(false);
  });

  it("fails closed when any abstention verifier attempt fails", () => {
    const response = buildResponse({
      answer: "2 AM",
      decision: "answer",
      supportSessionIds: ["session-a", "session-b"],
    });
    const result = resolvePhase72LongMemEvalVerifierAttempts({
      attempts: [
        { executionFailure: false, response },
        { executionFailure: false, response },
        { executionFailure: true, response },
      ],
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "No answer",
      stage: "abstention",
      testCase: buildTestCase("single-session-user"),
    });
    expect(result.executionFailure).toBe(true);
    expect(result.admission.accepted).toBe(false);
    expect(result.chosenAnswer).toBe("No answer");
  });

  it("requires two retrieved sessions for changing-state revisions", () => {
    const testCase = buildTestCase("knowledge-update");
    const base = {
      executionFailure: false,
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "The old value.",
      stage: "knowledge-update" as const,
      testCase,
    };
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({ supportSessionIds: ["session-a", "session-b"] }),
    }).accepted).toBe(true);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({ supportSessionIds: ["session-a"] }),
    }).accepted).toBe(false);
  });

  it("admits assistant-detail revisions only for short or explicitly incomplete sources with exact quotes", () => {
    const testCase = buildTestCase();
    const base = {
      executionFailure: false,
      retrievedSessionIds: ["session-a", "session-b"],
      stage: "assistant-detail" as const,
      testCase,
    };
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({ evidenceQuotes: ['the body is \\"blue\\"'] }),
      sourceAnswer: "Blue",
    }).accepted).toBe(true);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({ evidenceQuotes: ["invented quote"] }),
      sourceAnswer: "No exact answer",
    }).accepted).toBe(false);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({
        evidenceQuotes: ["C D E F G A B A G F E D C"],
      }),
      sourceAnswer: "This is already a long and complete substantive answer.",
    }).accepted).toBe(false);
  });

  it("requires an exact two-session dated timeline", () => {
    const testCase = buildTestCase("temporal-reasoning");
    const base = {
      executionFailure: false,
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "The thermostat came first.",
      stage: "timeline" as const,
      testCase,
    };
    const response = buildResponse({
      supportSessionIds: ["session-a", "session-b"],
      timeline: [
        { event: "Thermostat installed", sessionDate: "2026-01-01", sessionId: "session-a" },
        { event: "Router installed", sessionDate: "2026-01-08", sessionId: "session-b" },
      ],
    });
    expect(admitPhase72LongMemEvalVerifierResponse({ ...base, response }).accepted).toBe(true);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: {
        ...response,
        timeline: [
          response.timeline[0]!,
          { ...response.timeline[1]!, sessionDate: "2026-01-09" },
        ],
      },
    }).accepted).toBe(false);
  });

  it("requires an exact user quote for each preference revision", () => {
    const testCase = buildTestCase("single-session-preference");
    const base = {
      executionFailure: false,
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "Use any keyboard.",
      stage: "preference" as const,
      testCase,
    };
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({
        evidenceQuotes: [
          "I prefer a compact keyboard for travel.",
          "The compact keyboard worked well on my last trip.",
        ],
        supportSessionIds: ["session-a", "session-b"],
      }),
    }).accepted).toBe(true);
    expect(admitPhase72LongMemEvalVerifierResponse({
      ...base,
      response: buildResponse({
        evidenceQuotes: ["I prefer a compact keyboard for travel."],
      }),
    }).accepted).toBe(true);
  });

  it("requires unanimous preference revision attempts with shared user evidence", () => {
    const testCase = buildTestCase("single-session-preference");
    const sharedQuote = "I prefer a compact keyboard for travel.";
    const response = buildResponse({
      answer: "Use the compact keyboard that worked well on the last trip.",
      evidenceQuotes: [sharedQuote],
      supportSessionIds: ["session-a"],
    });
    const base = {
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "Use any keyboard.",
      stage: "preference" as const,
      testCase,
    };
    const accepted = resolvePhase72LongMemEvalVerifierAttempts({
      ...base,
      attempts: [
        { executionFailure: false, response },
        {
          executionFailure: false,
          response: {
            ...response,
            answer: "Choose a compact keyboard for travel.",
            evidenceQuotes: [
              sharedQuote,
              "The compact keyboard worked well on my last trip.",
            ],
            supportSessionIds: ["session-a", "session-b"],
          },
        },
        {
          executionFailure: false,
          response: {
            ...response,
            answer: "Prioritize a compact travel keyboard.",
          },
        },
      ],
    });
    expect(accepted.agreeingAttempts).toBe(3);
    expect(accepted.admission.accepted).toBe(true);

    const notUnanimous = resolvePhase72LongMemEvalVerifierAttempts({
      ...base,
      attempts: [
        { executionFailure: false, response },
        { executionFailure: false, response },
        {
          executionFailure: false,
          response: { ...response, answer: base.sourceAnswer, decision: "keep" },
        },
      ],
    });
    expect(notUnanimous.admission.accepted).toBe(false);

    const noSharedEvidence = resolvePhase72LongMemEvalVerifierAttempts({
      ...base,
      attempts: [
        { executionFailure: false, response },
        {
          executionFailure: false,
          response: {
            ...response,
            evidenceQuotes: ["The compact keyboard worked well on my last trip."],
            supportSessionIds: ["session-b"],
          },
        },
        { executionFailure: false, response },
      ],
    });
    expect(noSharedEvidence.admission.accepted).toBe(false);
  });

  it("rejects every stage on model failure or an unchanged proposal", () => {
    const testCase = buildTestCase("knowledge-update");
    const response = buildResponse({
      answer: "Unchanged",
      supportSessionIds: ["session-a", "session-b"],
    });
    expect(admitPhase72LongMemEvalVerifierResponse({
      executionFailure: true,
      response,
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "Old",
      stage: "knowledge-update",
      testCase,
    }).accepted).toBe(false);
    expect(admitPhase72LongMemEvalVerifierResponse({
      executionFailure: false,
      response: { ...response, answer: "Old" },
      retrievedSessionIds: ["session-a", "session-b"],
      sourceAnswer: "Old",
      stage: "knowledge-update",
      testCase,
    }).accepted).toBe(false);
  });
});
