import { describe, expect, it } from "bun:test";
import {
  LOCOMO_UPSTREAM_URL,
  loadLocomoPrepSource,
  normalizeLocomoPrepCases,
  parseLocomoPrepCliOptions,
  validateLocomoPrepSource,
} from "../../scripts/prepare-phase-65-locomo-data";

describe("phase-65 LoCoMo external-root prep", () => {
  it("rejects content drift at the pinned upstream URL", () => {
    expect(() =>
      validateLocomoPrepSource({
        raw: "{}",
        sourceUrl: LOCOMO_UPSTREAM_URL,
      }),
    ).toThrow("Pinned LoCoMo source SHA-256 mismatch");

    expect(
      validateLocomoPrepSource({
        raw: "{}",
        sourceFile: "/tmp/locomo10.json",
        sourceUrl: LOCOMO_UPSTREAM_URL,
      }),
    ).toHaveLength(64);
  });

  it("normalizes legacy colon-prefixed dia_ids in turns and QA evidence", () => {
    const cases = normalizeLocomoPrepCases(
      [
        {
          conversation: {
            session_11: [
              {
                blip_caption: "a photo of a contemporary dance performance",
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
    expect(cases[0]?.turns[1]?.content).toBe(
      "I started the dance studio after leaving banking.\n\nImage caption: a photo of a contemporary dance performance",
    );
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
      sourceUrl:
        "https://raw.githubusercontent.com/snap-research/locomo/cbfbc1dba6bc53d00625212a0f22d55ffee7c1fc/data/locomo10.json",
    });

    expect(
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--output-root",
        "/tmp/LOCOMO-full",
        "--source-url",
        "https://example.test/locomo10.json",
        "--max-conversations",
        "1",
        "--max-questions-per-case",
        "0",
      ]),
    ).toEqual({
      maxConversations: 1,
      maxQuestionsPerCase: 0,
      outputRoot: "/tmp/LOCOMO-full",
      sourceFile: undefined,
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

  it("rejects empty or whitespace-padded output-root environment values", () => {
    const original = process.env.GOODMEMORY_LOCOMO_ROOT;
    try {
      process.env.GOODMEMORY_LOCOMO_ROOT = "/tmp/LOCOMO-env";
      expect(
        parseLocomoPrepCliOptions([
          "bun",
          "run",
          "scripts/prepare-phase-65-locomo-data.ts",
          "--max-conversations",
          "1",
        ]).outputRoot,
      ).toBe("/tmp/LOCOMO-env");

      process.env.GOODMEMORY_LOCOMO_ROOT = " /tmp/LOCOMO-env ";
      expect(() =>
        parseLocomoPrepCliOptions([
          "bun",
          "run",
          "scripts/prepare-phase-65-locomo-data.ts",
        ]),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");

      process.env.GOODMEMORY_LOCOMO_ROOT = "";
      expect(() =>
        parseLocomoPrepCliOptions([
          "bun",
          "run",
          "scripts/prepare-phase-65-locomo-data.ts",
        ]),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");
    } finally {
      if (original === undefined) {
        delete process.env.GOODMEMORY_LOCOMO_ROOT;
      } else {
        process.env.GOODMEMORY_LOCOMO_ROOT = original;
      }
    }
  });

  it("rejects ambiguous source file and source url selectors", () => {
    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--source-file",
        "/tmp/locomo10.json",
        "--source-url",
        "https://example.test/locomo10.json",
      ]),
    ).toThrow("--source-file and --source-url cannot both be specified.");
  });

  it("rejects a source file that resolves to the output cases file", () => {
    expect(() =>
      parseLocomoPrepCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-data.ts",
        "--output-root",
        "/tmp/LOCOMO",
        "--source-file",
        "/tmp/LOCOMO/../LOCOMO/cases.json",
      ]),
    ).toThrow(
      "--source-file and --output-root/cases.json must refer to different paths",
    );
  });

  it("loads source files without fetching a source url", async () => {
    const raw = await loadLocomoPrepSource({
      fetchSource: async () => {
        throw new Error("fetch should not be called for source files");
      },
      readTextFile: async (path) => `local:${path}`,
      sourceFile: "/tmp/locomo10.json",
      sourceUrl: "https://example.test/locomo10.json",
    });

    expect(raw).toBe("local:/tmp/locomo10.json");
  });

  it("rejects failed source-url fetches before JSON parsing", async () => {
    await expect(
      loadLocomoPrepSource({
        fetchSource: async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: async () => "<html>not json</html>",
        }),
        sourceUrl: "https://example.test/missing-locomo10.json",
      }),
    ).rejects.toThrow(
      "Failed to fetch LoCoMo source https://example.test/missing-locomo10.json: 404 Not Found.",
    );
  });

  it("loads source-url text after a successful fetch", async () => {
    const raw = await loadLocomoPrepSource({
      fetchSource: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "[{\"sample_id\":\"conv-1\"}]",
      }),
      sourceUrl: "https://example.test/locomo10.json",
    });

    expect(raw).toBe("[{\"sample_id\":\"conv-1\"}]");
  });
});
