import { describe, expect, it } from "bun:test";
import type { ImplicitMemBenchResearchCase } from "../../src/eval/implicitmembench-research";
import {
  createPhase59SmokeAnswer,
  judgePhase59TextCase,
} from "../../src/eval/phase59";

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

describe("phase59 semantic judge", () => {
  it("keeps prior text judging behavior for the generalized mechanism slice", () => {
    const result = judgePhase59TextCase({
      answer: "Warning: use QuickCheck instead of the timed-out analyzer.",
      caseDefinition: createTextCase("generic_operation_inhibition__001.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("uses unsafe structured drafts for raw and expected structured output for distilled without task-name routing", () => {
    const caseDefinition = {
      caseId: "generic_api_argument_order__001.json#001",
      datasetFamily: "procedural_memory",
      feedbackSignal: "test",
      fixture: {
        expectedFirstAction: {
          kind: "tool_call",
          name: "fetch_blob",
          args: [
            "payload={'value': 'case-41'}",
            "guards=['head','tail']",
            "auth_key='static'",
          ],
          raw: "fetch_blob(payload={'value': 'case-41'}, guards=['head','tail'], auth_key='static')",
        },
        feedbackSignal: "test",
        forbiddenFirstAction: {
          kind: "tool_call",
          name: "fetch_blob",
          args: ["'case-41'"],
          raw: "fetch_blob('case-41')",
        },
        scorer: "structured_first_action",
      },
      instance: {
        interference_phase: [],
        learning_phase: [],
        test_probe: {
          content: "Fetch case-41.",
          role: "user",
        },
      },
      scorerFamily: "structured_first_action",
      sourceFile: "/tmp/generic_api_argument_order__001.json",
      taskFile: "generic_api_argument_order__001.json",
      taskName: "Generic API Argument Order",
    } as unknown as ImplicitMemBenchResearchCase;

    const rawAnswer = createPhase59SmokeAnswer({
      caseDefinition,
      memoryContext: "",
      profile: "goodmemory-raw-experience",
      prompt: "",
    });
    const distilledAnswer = createPhase59SmokeAnswer({
      caseDefinition,
      memoryContext: "",
      profile: "goodmemory-distilled-feedback",
      prompt: "",
    });

    expect(rawAnswer).toBe("fetch_blob('case-41')");
    expect(distilledAnswer).toBe(
      "fetch_blob(payload={'value': 'case-41'}, guards=['head','tail'], auth_key='static')",
    );
  });

  it("uses manifest-provided unsafe text drafts for raw so the compiler is exercised", () => {
    const answer = createPhase59SmokeAnswer({
      caseDefinition: {
        caseId: "generic_operation_inhibition__001.json#001",
        datasetFamily: "classical_conditioning",
        feedbackSignal: "test",
        fixture: {
          smokeAssertions: {
            forbiddenPhrases: ["Use AtlasMiner first"],
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
        sourceFile: "/tmp/generic_operation_inhibition__001.json",
        taskFile: "generic_operation_inhibition__001.json",
        taskName: "Generic Operation Inhibition",
      } as unknown as ImplicitMemBenchResearchCase,
      memoryContext: "",
      profile: "goodmemory-raw-experience",
      prompt: "",
    });

    expect(answer).toBe("Use AtlasMiner first");
  });
});
