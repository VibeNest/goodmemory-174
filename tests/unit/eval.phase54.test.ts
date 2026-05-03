import { describe, expect, it } from "bun:test";
import type { ImplicitMemBenchResearchCase } from "../../src/eval/implicitmembench-research";
import {
  createPhase54SmokeAnswer,
  judgePhase54TextCase,
} from "../../src/eval/phase54";

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

describe("phase54 semantic judge", () => {
  it("accepts analogy wording without forcing a literal like token", () => {
    const result = judgePhase54TextCase({
      answer:
        "I can explain it with a simple analogy and keep the explanation beginner-friendly.",
      caseDefinition: createTextCase("conditioned_jargon_avoidance.json"),
    });

    expect(result.passed).toBe(true);
  });

  it("uses fixture expectedFirstAction raw output for structured smoke answers", () => {
    const answer = createPhase54SmokeAnswer(
      {
        caseId: "the_alien_filesystem.json#001",
        datasetFamily: "procedural_memory",
        feedbackSignal: "test",
        fixture: {
          expectedFirstAction: {
            kind: "command",
            name: "nav",
            args: ["|Projects|"],
            raw: "nav |Projects|",
          },
          feedbackSignal: "test",
          forbiddenFirstAction: {
            kind: "command",
            name: "cd",
            args: ["Projects"],
            raw: "cd Projects",
          },
          scorer: "structured_first_action",
        },
        instance: {
          interference_phase: [],
          learning_phase: [],
          test_probe: {
            content: "Switch into Projects.",
            role: "user",
          },
        },
        scorerFamily: "structured_first_action",
        sourceFile: "/tmp/the_alien_filesystem.json",
        taskFile: "the_alien_filesystem.json",
        taskName: "The Alien Filesystem",
      } as unknown as ImplicitMemBenchResearchCase,
      "goodmemory-raw-experience",
    );

    expect(answer).toBe("nav |Projects|");
  });
});
