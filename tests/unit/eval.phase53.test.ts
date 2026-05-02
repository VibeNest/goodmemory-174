import { describe, expect, it } from "bun:test";
import type { ImplicitMemBenchResearchCase } from "../../src/eval/implicitmembench-research";
import { judgePhase53TextCase } from "../../src/eval/phase53";

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

describe("phase53 semantic judge", () => {
  it("accepts analogy wording without forcing a literal like token", () => {
    const result = judgePhase53TextCase({
      answer:
        "I can explain it with a simple analogy and keep the explanation beginner-friendly.",
      caseDefinition: createTextCase("conditioned_jargon_avoidance.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("still rejects analogy answers that leak the blocked term", () => {
    const result = judgePhase53TextCase({
      answer:
        "I can explain the API with a simple analogy and keep it beginner-friendly.",
      caseDefinition: createTextCase("conditioned_jargon_avoidance.json"),
    });

    expect(result.passed).toBe(false);
  });
});
