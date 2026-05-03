import { describe, expect, it } from "bun:test";
import type { ImplicitMemBenchResearchCase } from "../../src/eval/implicitmembench-research";
import {
  createPhase57SmokeAnswer,
  judgePhase57TextCase,
} from "../../src/eval/phase57";

function createTextCase(taskFile: string): ImplicitMemBenchResearchCase {
  return {
    caseId: `${taskFile}#001`,
    datasetFamily: "classical_conditioning",
    feedbackSignal: "test",
    fixture: {
      smokeAssertions: {
        requiredKeywords: [],
      },
    },
    instance: {
      interference_phase: [],
      learning_phase: [],
      test_probe: {
        content: "probe",
        role: "user",
      },
    },
    scorerFamily: "text_behavior_judge",
    sourceFile: `/tmp/${taskFile}`,
    taskFile,
    taskName: taskFile,
  } as unknown as ImplicitMemBenchResearchCase;
}

describe("phase57 semantic judge", () => {
  it("keeps Phase 56 text judging behavior for the targeted mechanism slice", () => {
    const result = judgePhase57TextCase({
      answer: "Warning: use QuickCheck instead of the timed-out analyzer.",
      caseDefinition: createTextCase("conditioned_api_aversion.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("uses fixture expectedFirstAction raw output for structured smoke answers", () => {
    const answer = createPhase57SmokeAnswer({
      caseDefinition: {
        caseId: "the_eccentric_api_call.json#001",
        datasetFamily: "procedural_memory",
        feedbackSignal: "test",
        fixture: {
          expectedFirstAction: {
            kind: "tool_call",
            name: "get_data",
            args: [
              "query_payload={'value': 'invoice-042'}",
              "buffer=['preface','suffix']",
              "auth='token'",
            ],
            raw: "get_data(query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'], auth='token')",
          },
          feedbackSignal: "test",
          forbiddenFirstAction: {
            kind: "tool_call",
            name: "get_data",
            args: [
              "auth='token'",
              "query_payload={'value': 'invoice-042'}",
              "buffer=['preface','suffix']",
            ],
            raw: "get_data(auth='token', query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'])",
          },
          scorer: "structured_first_action",
        },
        instance: {
          interference_phase: [],
          learning_phase: [],
          test_probe: {
            content: "Fetch invoice-042.",
            role: "user",
          },
        },
        scorerFamily: "structured_first_action",
        sourceFile: "/tmp/the_eccentric_api_call.json",
        taskFile: "the_eccentric_api_call.json",
        taskName: "The Eccentric API Call",
      } as unknown as ImplicitMemBenchResearchCase,
      memoryContext: "",
      profile: "goodmemory-raw-experience",
      prompt: "",
    });

    expect(answer).toBe(
      "get_data(query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'], auth='token')",
    );
  });
});
