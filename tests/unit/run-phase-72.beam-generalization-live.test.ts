import { describe, expect, it } from "bun:test";
import type { Phase63BeamLiveSliceReport } from "../../scripts/run-phase-63-beam-live-slice";
import {
  parsePhase72BeamGeneralizationLiveCliOptions,
  runPhase72BeamGeneralizationLive,
} from "../../scripts/run-phase-72-beam-generalization-live";

function buildReport(): Phase63BeamLiveSliceReport {
  return {
    answerPostprocessing: "none",
    benchmarkRoot: "/tmp/BEAM",
    cases: [],
    generatedAt: "2026-07-12T00:00:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-live-slice.ts",
    mode: "live-answer-slice",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profile: "goodmemory-hybrid",
    runDirectory: "/tmp/out/run-beam-generalization",
    runId: "run-beam-generalization",
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      correctCases: 0,
      evidenceCaseCount: 0,
      evidenceChatRecall: null,
      executionFailures: 0,
      missedRecallCases: 0,
      profilesCompared: ["goodmemory-hybrid"],
      scale: "100K",
      totalCases: 0,
      wrongAnswerCases: 0,
      wrongRecallCases: 0,
    },
  };
}

describe("Phase 72 BEAM generalization live runner", () => {
  it("defaults to the measured top-96 semantic candidate budget", () => {
    expect(
      parsePhase72BeamGeneralizationLiveCliOptions([
        "bun",
        "run",
        "scripts/run-phase-72-beam-generalization-live.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--run-id",
        "run-beam-generalization",
      ]),
    ).toMatchObject({
      answerPostprocessing: "none",
      benchmarkRoot: "/tmp/BEAM",
      evidencePack: true,
      packetEvidence: false,
      profile: "goodmemory-hybrid",
      runId: "run-beam-generalization",
      semanticTopK: 96,
    });

    expect(() =>
      parsePhase72BeamGeneralizationLiveCliOptions([
        "bun",
        "run",
        "scripts/run-phase-72-beam-generalization-live.ts",
        "--semantic-topk",
        "96",
        "--semantic-topk",
        "64",
      ]),
    ).toThrow("--semantic-topk cannot be specified more than once");

    expect(() =>
      parsePhase72BeamGeneralizationLiveCliOptions([
        "bun",
        "run",
        "scripts/run-phase-72-beam-generalization-live.ts",
        "--packet-evidence",
      ]),
    ).toThrow(
      "Phase 72 BEAM generalization runs use full recalled membership; --packet-evidence requires a separate rank-consuming experiment.",
    );
  });

  it("disables fitted gates, injects the general memory factory, and restores env", async () => {
    const env: Record<string, string | undefined> = {
      GOODMEMORY_DISABLED_NARROW_GATES: "previous-gate",
      GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
      GOODMEMORY_EMBEDDING_BASE_URL: "https://embedding.test/v1",
      GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
      GOODMEMORY_EVAL_API_KEY: "answer-key",
      GOODMEMORY_EVAL_BASE_URL: "https://ai.gurkiai.com/v1",
      GOODMEMORY_EVAL_MODEL: "gpt-5.6-terra",
      GOODMEMORY_EVAL_PROVIDER: "openai",
      GOODMEMORY_JUDGE_BASE_URL: "https://ai.gurkiai.com/v1",
      GOODMEMORY_JUDGE_MODEL: "gpt-5.5",
      GOODMEMORY_JUDGE_PROVIDER: "openai",
    };
    const resets: string[] = [];
    const writes = new Map<string, string>();
    let receivedDisabledGates: string | undefined;
    let receivedAnswerPostprocessing: string | undefined;
    let receivedEvidencePack: boolean | undefined;
    let receivedProfile: string | undefined;
    let receivedMemoryFactory = false;
    let receivedPacketEvidence: boolean | undefined;

    const result = await runPhase72BeamGeneralizationLive(
      {
        benchmarkRoot: "/tmp/BEAM",
        answerPostprocessing: "none",
        evidencePack: true,
        packetEvidence: false,
        profile: "goodmemory-hybrid",
        runId: "run-beam-generalization",
        semanticTopK: 96,
      },
      {
        env,
        listNarrowGateIds: () => ["gate-a", "gate-b"],
        resetNarrowGateDisables: () => resets.push("reset"),
        runLiveSlice: async (options, dependencies) => {
          receivedDisabledGates = env.GOODMEMORY_DISABLED_NARROW_GATES;
          receivedAnswerPostprocessing = options.answerPostprocessing;
          receivedEvidencePack = options.evidencePack;
          receivedPacketEvidence = options.packetEvidence;
          receivedProfile = options.profile;
          receivedMemoryFactory = typeof dependencies?.createMemory === "function";
          return buildReport();
        },
        writeFile: async (path, value) => {
          writes.set(String(path), String(value));
        },
      },
    );

    expect(receivedDisabledGates).toBe("gate-a,gate-b");
    expect(receivedAnswerPostprocessing).toBe("none");
    expect(receivedEvidencePack).toBe(true);
    expect(receivedPacketEvidence).toBe(false);
    expect(receivedProfile).toBe("goodmemory-hybrid");
    expect(receivedMemoryFactory).toBe(true);
    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBe("previous-gate");
    expect(resets).toHaveLength(2);
    expect(result.semanticTopK).toBe(96);
    expect(
      writes.has(
        "/tmp/out/run-beam-generalization/phase-72-generalization-manifest.json",
      ),
    ).toBe(true);
    const manifest = JSON.parse(
      writes.get(
        "/tmp/out/run-beam-generalization/phase-72-generalization-manifest.json",
      )!,
    );
    expect(manifest.evidenceContext).toBe("full-recall-evidence-pack");
    expect(manifest.answerPostprocessing).toBe("none");
    expect(manifest.reranking).toEqual({
      answerContextConsumesRank: false,
      enabled: false,
      reason: "full_recall_context_uses_membership_not_rank",
    });
    expect(manifest).not.toHaveProperty("rerankerModel");
  });
});
