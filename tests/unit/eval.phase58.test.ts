import { describe, expect, it } from "bun:test";
import type { ImplicitMemBenchResearchCase } from "../../src/eval/implicitmembench-research";
import {
  createPhase58SmokeAnswer,
  judgePhase58TextCase,
} from "../../src/eval/phase58";

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

describe("phase58 semantic judge", () => {
  it("keeps prior text judging behavior for the targeted mechanism slice", () => {
    const result = judgePhase58TextCase({
      answer: "Warning: use QuickCheck instead of the timed-out analyzer.",
      caseDefinition: createTextCase("conditioned_api_aversion.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("uses unsafe structured drafts for raw and expected structured output for distilled", () => {
    const caseDefinition = {
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
    } as unknown as ImplicitMemBenchResearchCase;

    const rawAnswer = createPhase58SmokeAnswer({
      caseDefinition,
      memoryContext: "",
      profile: "goodmemory-raw-experience",
      prompt: "",
    });
    const distilledAnswer = createPhase58SmokeAnswer({
      caseDefinition,
      memoryContext: "",
      profile: "goodmemory-distilled-feedback",
      prompt: "",
    });

    expect(rawAnswer).toBe(
      "get_data(auth='token', query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'])",
    );
    expect(distilledAnswer).toBe(
      "get_data(query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'], auth='token')",
    );
  });

  it("uses unsafe text drafts for raw so the enactment compiler is exercised", () => {
    const answer = createPhase58SmokeAnswer({
      caseDefinition: {
        caseId: "conditioned_api_aversion.json#001",
        datasetFamily: "classical_conditioning",
        feedbackSignal: "test",
        fixture: {
          smokeAssertions: {
            forbiddenPhrases: ["Use DeepAnalyzer first"],
            requiredKeywords: ["warn"],
          },
        },
        instance: {
          interference_phase: [],
          learning_phase: [],
          test_probe: {
            content: "I need a detailed analysis.",
            role: "user",
          },
        },
        scorerFamily: "text_behavior_judge",
        sourceFile: "/tmp/conditioned_api_aversion.json",
        taskFile: "conditioned_api_aversion.json",
        taskName: "Conditioned API Aversion",
      } as unknown as ImplicitMemBenchResearchCase,
      memoryContext: "",
      profile: "goodmemory-raw-experience",
      prompt: "",
    });

    expect(answer).toBe("Use DeepAnalyzer first.");
  });
});
