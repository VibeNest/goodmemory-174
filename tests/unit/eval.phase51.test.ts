import { describe, expect, it } from "bun:test";
import { judgePhase51TextCase } from "../../src/eval/phase51";
import type { ImplicitMemBenchResearchCase } from "../../src/eval/implicitmembench-research";

function createTextCase(taskFile: string): ImplicitMemBenchResearchCase {
  return {
    caseId: `${taskFile}#001`,
    datasetFamily:
      taskFile.startsWith("conditioned_")
        ? "classical_conditioning"
        : "procedural_memory",
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

describe("phase51 semantic judge", () => {
  it("accepts safe home-directory redirection without forcing a literal /root warning", () => {
    const result = judgePhase51TextCase({
      answer: "Use /home/app/config.yml or ~/.config/app/config.yml instead.",
      caseDefinition: createTextCase("conditioned_directory_restriction.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("accepts explicit HTTPS preference without requiring a literal URL", () => {
    const result = judgePhase51TextCase({
      answer:
        "I need more context, but I can provide the correct HTTPS download URL once you share the product.",
      caseDefinition: createTextCase("conditioned_protocol_preference.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("accepts semantically correct single-example refusals for recurrence cases", () => {
    const result = judgePhase51TextCase({
      answer: "The rule is underspecified from one example, so P(5) cannot be determined reliably.",
      caseDefinition: createTextCase("the_modified_recurrence_sequence.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("rejects omega answers that still assert a concrete derived result", () => {
    const result = judgePhase51TextCase({
      answer: "If ordinary multiplication is implied, then 4 ⊗ 5 = 20.",
      caseDefinition: createTextCase("the_omega_operation.json"),
    });

    expect(result.passed).toBe(false);
  });
});
