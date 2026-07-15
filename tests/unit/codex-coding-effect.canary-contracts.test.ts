import { describe, expect, it } from "bun:test";

import {
  buildNativeCodexArgs,
  buildNativeCanaryPrompts,
  buildNativeCanarySessionDigest,
  evaluateNativeCanaryEvidence,
  parseCodexFeatureList,
} from "../../scripts/codex-coding-effect/native-canary-contracts";

function acceptedEvidence() {
  const firstThreadId = "019f0000-0000-7000-8000-000000000001";
  const secondThreadId = "019f0000-0000-7000-8000-000000000002";
  const firstSessionDigest = buildNativeCanarySessionDigest(firstThreadId);
  const secondSessionDigest = buildNativeCanarySessionDigest(secondThreadId);

  return {
    codexHooks: { enabled: true, maturity: "stable" as const },
    firstSession: {
      injectionEvents: [{
        command: "user-prompt-submit" as const,
        decision: "injected" as const,
        recordIds: ["seed-memory"],
        sessionDigest: firstSessionDigest,
      }],
      threadId: firstThreadId,
    },
    hostStatus: {
      hookRegistered: true,
      writeback: {
        mode: "selective" as const,
        persistRawTranscript: false,
      },
    },
    manualRolloutSelectionUsed: false,
    openLoopMarker: "c2-next-action-abc123",
    secondSession: {
      injectionEvents: [{
        command: "session-start" as const,
        decision: "injected" as const,
        recordIds: ["writeback-memory"],
        sessionDigest: secondSessionDigest,
      }],
      threadId: secondThreadId,
    },
    seedMemoryId: "seed-memory",
    transcript: {
      conversationMessageCount: 2,
      formatDrift: null,
      sessionId: firstThreadId,
      sourceSha256: "a".repeat(64),
    },
    transcriptCursorSessionDigests: [firstSessionDigest],
    writebackEvents: [{
      command: "turn-end" as const,
      contentPreview: "Next step is c2-next-action-abc123.",
      linkedRecordIds: [{ id: "writeback-memory", type: "memory" as const }],
      recallHitCount: 1,
      recalledBy: [{ sessionDigest: secondSessionDigest }],
      sessionDigest: firstSessionDigest,
      status: "committed" as const,
    }],
  };
}

describe("Codex native canary contracts", () => {
  it("parses the installed Codex feature list without treating mere presence as enabled", () => {
    expect(parseCodexFeatureList([
      "hooks                                stable             true",
      "memories                             experimental       false",
    ].join("\n"))).toEqual({ enabled: true, maturity: "stable" });

    expect(parseCodexFeatureList(
      "hooks                                stable             false\n",
    )).toEqual({ enabled: false, maturity: "stable" });
    expect(() => parseCodexFeatureList("memories experimental false\n"))
      .toThrow("Codex feature list does not contain hooks");
  });

  it("builds a fresh noninteractive invocation that keeps isolated host config", () => {
    expect(buildNativeCodexArgs({
      model: "gpt-test",
      prompt: "Run the native canary.",
      reasoningEffort: "high",
      workspaceRoot: "/tmp/c2/workspace",
    })).toEqual([
      "--enable",
      "hooks",
      "--ask-for-approval",
      "never",
      "--dangerously-bypass-hook-trust",
      "exec",
      "--strict-config",
      "--json",
      "--sandbox",
      "read-only",
      "--model",
      "gpt-test",
      "-c",
      "model_reasoning_effort=\"high\"",
      "--cd",
      "/tmp/c2/workspace",
      "Run the native canary.",
    ]);
  });

  it("keeps the writeback marker inside the bounded public audit preview", () => {
    const marker = "c2-next-action-abc123";
    const lookupKey = "c2-handoff-key-abc123";
    const prompts = buildNativeCanaryPrompts({
      lookupKey,
      openLoopMarker: marker,
    });

    expect(prompts.first.slice(0, 160)).toContain(marker);
    expect(prompts.first.length).toBeLessThanOrEqual(260);
    expect(prompts.first).toContain(lookupKey);
    expect(prompts.first).not.toContain("undefined");
    expect(prompts.first).toContain("only open C2 canary action");
    expect(prompts.second).toContain(lookupKey);
    expect(prompts.second).not.toContain(marker);
  });

  it("accepts only native injection, Stop hydration, ledger, and fresh-session recall", () => {
    expect(evaluateNativeCanaryEvidence(acceptedEvidence())).toEqual({
      firstSessionDigest: buildNativeCanarySessionDigest(
        "019f0000-0000-7000-8000-000000000001",
      ),
      passed: true,
      reasons: [],
      recalledWritebackRecordIds: ["writeback-memory"],
      secondSessionDigest: buildNativeCanarySessionDigest(
        "019f0000-0000-7000-8000-000000000002",
      ),
      writebackRecordIds: ["writeback-memory"],
    });
  });

  it("fails closed without Stop, exact session linkage, or fresh-session recall", () => {
    const missingStop = acceptedEvidence();
    missingStop.writebackEvents = [];
    expect(evaluateNativeCanaryEvidence(missingStop)).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["native Stop writeback was not committed"]),
    });

    const sameThread = acceptedEvidence();
    sameThread.secondSession.threadId = sameThread.firstSession.threadId;
    expect(evaluateNativeCanaryEvidence(sameThread)).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["fresh Codex session reused the first thread id"]),
    });

    const rawPersistence = acceptedEvidence();
    rawPersistence.hostStatus.writeback.persistRawTranscript = true;
    expect(evaluateNativeCanaryEvidence(rawPersistence)).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["raw transcript persistence is enabled"]),
    });

    const manualFallback = acceptedEvidence();
    manualFallback.manualRolloutSelectionUsed = true;
    expect(evaluateNativeCanaryEvidence(manualFallback)).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["manual rollout selection was used"]),
    });

    const missingRecallAudit = acceptedEvidence();
    missingRecallAudit.writebackEvents[0]!.recallHitCount = 0;
    missingRecallAudit.writebackEvents[0]!.recalledBy = [];
    expect(evaluateNativeCanaryEvidence(missingRecallAudit)).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining([
        "public writeback audit did not record fresh-session recall",
      ]),
    });
  });
});
