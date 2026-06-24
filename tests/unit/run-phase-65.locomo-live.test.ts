import { describe, expect, it } from "bun:test";
import {
  buildLocomoEvidencePackContext,
  runLocomoSmoke,
} from "../../scripts/run-phase-65-locomo-smoke";
import { buildLocomoSmokeCases } from "../../src/eval/locomo";

describe("LoCoMo live answer evidence-pack wiring", () => {
  it("builds a source-ordered evidence pack from the retrieved turns", () => {
    const testCase = buildLocomoSmokeCases()[0];
    const pack = buildLocomoEvidencePackContext({
      question: testCase.questions[0],
      retrievedTurnIds: testCase.turns.map((turn) => turn.diaId),
      testCase,
    });
    expect(pack).toContain("Evidence (source-ordered, earliest first):");
    expect(pack).toContain("latest entry is the current value");
    // Carries the actual dialog content and a per-turn session time anchor.
    expect(pack).toContain(testCase.turns[0].content);
    expect(pack).toContain("session ");
  });

  it("routes the answer context through the pack when evidencePack is set", async () => {
    let capturedContext = "";
    const report = await runLocomoSmoke(
      { evidencePack: true },
      {
        answerGenerator: async (input) => {
          capturedContext = input.memoryContext;
          return "stub answer";
        },
        mkdir: async () => undefined,
        writeFile: async () => undefined,
      },
    );
    expect(report.mode).toBe("live-answer");
    expect(report.answerEvaluation).toBe("scored");
    expect(capturedContext).toContain("Evidence (source-ordered, earliest first):");
  });

  it("uses the plain dialog context when evidencePack is not set", async () => {
    let capturedContext = "";
    await runLocomoSmoke(
      {},
      {
        answerGenerator: async (input) => {
          capturedContext = input.memoryContext;
          return "stub answer";
        },
        mkdir: async () => undefined,
        writeFile: async () => undefined,
      },
    );
    expect(capturedContext).not.toContain("Evidence (source-ordered");
  });
});
