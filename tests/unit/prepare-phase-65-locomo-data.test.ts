import { describe, expect, it } from "bun:test";
import {
  normalizeLocomoPrepCases,
  parseLocomoPrepCliOptions,
} from "../../scripts/prepare-phase-65-locomo-data";

describe("phase-65 LoCoMo external-root prep", () => {
  it("normalizes legacy colon-prefixed dia_ids in turns and QA evidence", () => {
    const cases = normalizeLocomoPrepCases(
      [
        {
          conversation: {
            session_11: [
              {
                dia_id: "D:11:26",
                speaker: "speaker_a",
                text: "I started the dance studio after leaving banking.",
              },
            ],
            session_2: [
              {
                dia_id: "D2:3",
                speaker: "speaker_b",
                text: "Your favorite dance style is contemporary.",
              },
            ],
            speaker_a: "Gina",
            speaker_b: "Caroline",
          },
          qa: [
            {
              answer: "Gina started a dance studio and likes contemporary dance.",
              category: 3,
              evidence: ["D:11:26", "D2:3", "not-a-dia-id"],
              question: "What dance-related details are known about Gina?",
            },
          ],
          sample_id: "conv-43",
        },
      ],
      {
        maxConversations: 0,
        maxQuestionsPerCase: 0,
      },
    );

    expect(cases).toHaveLength(1);
    expect(cases[0]?.turns.map((turn) => turn.diaId)).toEqual(["D2:3", "D11:26"]);
    expect(cases[0]?.questions[0]?.evidenceTurnIds).toEqual(["D11:26", "D2:3"]);
  });

  it("parses prep scope flags with strict non-negative integer validation", () => {
    expect(
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--output-root",
        "/tmp/LOCOMO-full",
        "--source-file",
        "/tmp/locomo10.json",
        "--source-url",
        "https://example.test/locomo10.json",
        "--max-conversations",
        "0",
        "--max-questions-per-case",
        "40",
      ]),
    ).toEqual({
      maxConversations: 0,
      maxQuestionsPerCase: 40,
      outputRoot: "/tmp/LOCOMO-full",
      sourceFile: "/tmp/locomo10.json",
      sourceUrl: "https://example.test/locomo10.json",
    });

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--max-conversations",
        "1e2",
      ]),
    ).toThrow("--max-conversations must be a non-negative integer.");

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--max-questions-per-case",
        "40x",
      ]),
    ).toThrow("--max-questions-per-case must be a non-negative integer.");

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--max-conversations",
        "-1",
      ]),
    ).toThrow("--max-conversations must be a non-negative integer.");

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--max-conversations",
        "--source-file",
        "/tmp/locomo10.json",
      ]),
    ).toThrow("--max-conversations requires a value.");

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--max-conversations",
        "1",
        "--max-conversations",
        "2",
      ]),
    ).toThrow("--max-conversations cannot be specified more than once.");
  });

  it("rejects missing string flag values before falling back to defaults", () => {
    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--output-root",
        "--source-file",
        "/tmp/locomo10.json",
      ]),
    ).toThrow("--output-root requires a value.");

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--source-file",
        "--source-url",
        "https://example.test/locomo10.json",
      ]),
    ).toThrow("--source-file requires a value.");

    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--source-url",
        "--max-conversations",
        "1",
      ]),
    ).toThrow("--source-url requires a value.");
  });
});
