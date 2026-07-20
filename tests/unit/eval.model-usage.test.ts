import { describe, expect, it } from "bun:test";

import {
  appendPhase74ModelUsageEventSync,
  buildPhase74ModelUsageEvidence,
  createAttributedModelUsageSink,
  type AttributedModelUsageAttempt,
} from "../../src/eval/modelUsage";
import type { ModelUsageAttempt } from "../../src/provider/model-usage";

function attempt(input: {
  attempt?: number;
  completeness?: ModelUsageAttempt["completeness"];
  inputTokens?: number | null;
  operation?: ModelUsageAttempt["operation"];
  outputTokens?: number | null;
} = {}): ModelUsageAttempt {
  return {
    attempt: input.attempt ?? 1,
    completeness: input.completeness ?? "complete",
    modelId: "model-v1",
    operation: input.operation ?? "answer_generation",
    outcome: "succeeded",
    providerId: "openai",
    schemaVersion: 1,
    usage: {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      inputTokens: input.inputTokens === undefined ? 10 : input.inputTokens,
      outputTokens: input.outputTokens === undefined ? 2 : input.outputTokens,
      uncachedInputTokens: input.inputTokens === undefined ? 10 : input.inputTokens,
    },
  };
}

describe("Phase 74 eval model usage", () => {
  it("commits each attributed event to the durable recorder before returning", () => {
    const events: AttributedModelUsageAttempt[] = [];
    const recorded: AttributedModelUsageAttempt[] = [];
    const inMemoryLengthsAtCommit: number[] = [];
    const sink = createAttributedModelUsageSink({
      branch: "candidate",
      caseId: "case-1",
      events,
      onEvent: (event) => {
        inMemoryLengthsAtCommit.push(events.length);
        recorded.push(event);
      },
    });

    sink.emit(attempt());

    expect(recorded).toEqual(events);
    expect(inMemoryLengthsAtCommit).toEqual([0]);
    expect(sink.strict).toBe(true);
  });

  it("fsyncs each terminal event before closing its append handle", () => {
    const calls: string[] = [];
    appendPhase74ModelUsageEventSync("usage.jsonl", {
      ...attempt(),
      branch: "candidate",
      caseId: "case-1",
    }, {
      close(fd) {
        calls.push(`close:${fd}`);
      },
      fsync(fd) {
        calls.push(`fsync:${fd}`);
      },
      open(path) {
        calls.push(`open:${path}`);
        return 74;
      },
      write(fd, value) {
        calls.push(`write:${fd}:${value.endsWith("\n")}`);
      },
    });

    expect(calls).toEqual([
      "open:usage.jsonl",
      "write:74:true",
      "fsync:74",
      "close:74",
    ]);
  });

  it("attributes every retry and excludes judge usage from product-cost evidence", () => {
    const events: AttributedModelUsageAttempt[] = [];
    const baselineA = createAttributedModelUsageSink({
      branch: "baseline",
      caseId: "a",
      events,
    });
    const baselineB = createAttributedModelUsageSink({
      branch: "baseline",
      caseId: "b",
      events,
    });
    const candidateA = createAttributedModelUsageSink({
      branch: "candidate",
      caseId: "a",
      events,
    });
    const candidateB = createAttributedModelUsageSink({
      branch: "candidate",
      caseId: "b",
      events,
    });
    const judge = createAttributedModelUsageSink({
      branch: "judge",
      caseId: "a",
      events,
    });

    baselineA.emit(attempt());
    baselineB.emit(attempt());
    candidateA.emit(attempt({ operation: "assisted_extraction" }));
    candidateA.emit(attempt({ attempt: 2, operation: "answer_generation" }));
    candidateB.emit(attempt({ operation: "embedding" }));
    candidateB.emit(attempt({ operation: "answer_generation" }));
    judge.emit(attempt({ inputTokens: 1_000, operation: "judge" }));

    const evidence = buildPhase74ModelUsageEvidence(events);
    expect(evidence).toMatchObject({
      accountingVersion: "phase74-model-usage-v1",
      baseline: {
        answerGenerationCaseCount: 2,
        completeRequestCount: 2,
        logicalCaseCount: 2,
        missingRequestCount: 0,
        partialRequestCount: 0,
        operationCounts: { answer_generation: 2 },
        requestCount: 2,
        totalTokens: 24,
      },
      candidate: {
        answerGenerationCaseCount: 2,
        completeRequestCount: 4,
        logicalCaseCount: 2,
        missingRequestCount: 0,
        partialRequestCount: 0,
        operationCounts: {
          answer_generation: 2,
          assisted_extraction: 1,
          embedding: 1,
        },
        requestCount: 4,
        totalTokens: 48,
      },
      costBoundary: "full-product",
    });
    expect(evidence.baseline.caseIdsSha256).toBe(
      evidence.candidate.caseIdsSha256,
    );
  });

  it("retains missing attempts instead of treating them as zero-cost", () => {
    const events: AttributedModelUsageAttempt[] = [];
    const sink = createAttributedModelUsageSink({
      branch: "candidate",
      caseId: "case-1",
      events,
    });
    sink.emit(attempt({
      completeness: "missing",
      inputTokens: null,
      outputTokens: null,
    }));

    const evidence = buildPhase74ModelUsageEvidence(events);
    expect(evidence.candidate).toMatchObject({
      completeRequestCount: 0,
      logicalCaseCount: 1,
      missingRequestCount: 1,
      requestCount: 1,
      totalTokens: 0,
    });
  });

  it("uses the frozen cohort as denominator and records cases that failed before any model event", () => {
    const events: AttributedModelUsageAttempt[] = [];
    createAttributedModelUsageSink({
      branch: "baseline",
      caseId: "case-a",
      events,
    }).emit(attempt());
    createAttributedModelUsageSink({
      branch: "candidate",
      caseId: "case-a",
      events,
    }).emit(attempt());
    createAttributedModelUsageSink({
      branch: "candidate",
      caseId: "case-b",
      events,
    }).emit(attempt());

    const evidence = buildPhase74ModelUsageEvidence(events, {
      baselineCaseIds: ["case-a", "case-b"],
      candidateCaseIds: ["case-a", "case-b"],
    });
    expect(evidence.baseline).toMatchObject({
      logicalCaseCount: 2,
      unobservedCaseIds: ["case-b"],
    });
    expect(evidence.candidate.unobservedCaseIds).toEqual([]);
  });
});
