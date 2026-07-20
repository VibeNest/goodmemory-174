import { describe, expect, it } from "bun:test";

import {
  PHASE74_EXPERIMENT_ARMS,
  assertPhase74StageIsolation,
} from "../../src/eval/phase74ExperimentDesign";

const frozen = {
  answer: { maxTokens: 1_000, temperature: 0 },
  context: { maxTokens: 6_000 },
  reader: "generic-v1",
};

describe("Phase 74 experiment design", () => {
  it("declares the frozen E1-E4 arm order", () => {
    expect(PHASE74_EXPERIMENT_ARMS).toEqual({
      E1: ["fact-only", "raw-only", "atomic-contextual-raw-pointer"],
      E2: ["claim-temporal-off", "claim-temporal-on"],
      E3: ["recall-plan-off", "recall-plan-deterministic", "recall-plan-assisted"],
      E4: ["prose", "chronology", "compact_json", "json_locale_note"],
    });
  });

  it("allows E2 to change only the fusion-channel set", () => {
    expect(
      assertPhase74StageIsolation({
        baselineConfiguration: {
          ...frozen,
          retrieval: {
            generalizedFusionChannels: ["lexical", "dense", "entity"],
          },
        },
        candidateConfiguration: {
          ...frozen,
          retrieval: {
            generalizedFusionChannels: [
              "lexical",
              "dense",
              "entity",
              "temporal",
              "relation",
            ],
          },
        },
        stage: "E2",
      }),
    ).toEqual(["retrieval.generalizedFusionChannels"]);
  });

  it("rejects a reader or budget change hidden inside E2", () => {
    expect(() =>
      assertPhase74StageIsolation({
        baselineConfiguration: {
          ...frozen,
          retrieval: { generalizedFusionChannels: ["lexical"] },
        },
        candidateConfiguration: {
          ...frozen,
          context: { maxTokens: 8_000 },
          retrieval: {
            generalizedFusionChannels: ["lexical", "temporal"],
          },
        },
        stage: "E2",
      })
    ).toThrow("E2 changed frozen configuration path context.maxTokens");
  });

  it("allows E3 planner mode and plan execution but keeps the answer model frozen", () => {
    expect(
      assertPhase74StageIsolation({
        baselineConfiguration: {
          ...frozen,
          planner: { mode: "off" },
          retrieval: { recallPlanExecution: false },
        },
        candidateConfiguration: {
          ...frozen,
          planner: { mode: "assisted" },
          retrieval: { recallPlanExecution: true },
        },
        stage: "E3",
      }),
    ).toEqual(["planner.mode", "retrieval.recallPlanExecution"]);

    expect(() =>
      assertPhase74StageIsolation({
        baselineConfiguration: {
          ...frozen,
          answerModel: "terra",
          planner: { mode: "off" },
          retrieval: { recallPlanExecution: false },
        },
        candidateConfiguration: {
          ...frozen,
          answerModel: "another-model",
          planner: { mode: "deterministic" },
          retrieval: { recallPlanExecution: true },
        },
        stage: "E3",
      })
    ).toThrow("E3 changed frozen configuration path answerModel");
  });

  it("allows E4 to change only the ledger rendering format", () => {
    expect(
      assertPhase74StageIsolation({
        baselineConfiguration: {
          ...frozen,
          evidenceLedger: { format: "prose" },
        },
        candidateConfiguration: {
          ...frozen,
          evidenceLedger: { format: "compact_json" },
        },
        stage: "E4",
      }),
    ).toEqual(["evidenceLedger.format"]);
  });
});
