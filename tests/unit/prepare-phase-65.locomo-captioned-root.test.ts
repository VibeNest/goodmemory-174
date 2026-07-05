import { describe, expect, it } from "bun:test";
import type { LocomoCase } from "../../src/eval/locomo";
import {
  buildCaptionUserPrompt,
  buildCaptionedCase,
  buildLocalWindow,
  type Captioner,
  type CaptionerInput,
  enrichTurnContent,
  parseCaptionsFromModel,
  parseLocomoCaptionedRootCliOptions,
  prepareCaptionedRoot,
} from "../../scripts/prepare-phase-65-locomo-captioned-root";

const SAMPLE_CASE: LocomoCase = {
  caseId: "locomo-conversation-1",
  questions: [
    {
      adversarialAnswer: null,
      category: "single_hop",
      evidenceTurnIds: ["D1:2"],
      goldAnswer: "a downtown clinic",
      matchMode: "f1_token_overlap",
      question: "Where does Anna work?",
      questionId: "q0",
    },
    {
      adversarialAnswer: "a hospital in Berlin",
      category: "adversarial",
      evidenceTurnIds: [],
      goldAnswer: "No information available",
      matchMode: "adversarial_abstention",
      question: "What is Bob's secret diagnosis?",
      questionId: "q1",
    },
  ],
  sourceConversation: "conversation-1",
  speakers: ["Anna", "Bob"],
  turns: [
    { content: "hey how was your day", diaId: "D1:1", speaker: "Bob" },
    { content: "long shift at the clinic again", diaId: "D1:2", speaker: "Anna" },
    { content: "Max kept me up all night", diaId: "D1:3", speaker: "Bob" },
  ],
};

describe("LoCoMo captioned-root CLI", () => {
  it("parses explicit captioned-root scope and budget flags", () => {
    expect(
      parseLocomoCaptionedRootCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-captioned-root.ts",
        "--mode",
        "local-window-2",
        "--source-root",
        "/src",
        "--output-root",
        "/out",
        "--window-radius",
        "3",
        "--concurrency",
        "2",
      ]),
    ).toEqual({
      concurrency: 2,
      mode: "local-window-2",
      outputRoot: "/out",
      sourceRoot: "/src",
      windowRadius: 3,
    });
  });

  it("rejects missing string flag values before falling back to defaults", () => {
    expect(() =>
      parseLocomoCaptionedRootCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-captioned-root.ts",
        "--mode",
        "--source-root",
        "/src",
      ]),
    ).toThrow("--mode requires a value.");

    expect(() =>
      parseLocomoCaptionedRootCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-captioned-root.ts",
        "--source-root",
        "--output-root",
        "/out",
      ]),
    ).toThrow("--source-root requires a value.");

    expect(() =>
      parseLocomoCaptionedRootCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-captioned-root.ts",
        "--output-root",
        "--window-radius",
        "2",
      ]),
    ).toThrow("--output-root requires a value.");
  });

  it("strictly validates captioned-root numeric flags", () => {
    expect(() =>
      parseLocomoCaptionedRootCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-captioned-root.ts",
        "--window-radius",
        "1e2",
      ]),
    ).toThrow("--window-radius must be a positive integer.");

    expect(() =>
      parseLocomoCaptionedRootCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-65-locomo-captioned-root.ts",
        "--concurrency",
        "--mode",
        "turn-only",
      ]),
    ).toThrow("--concurrency requires a value.");
  });
});

describe("LoCoMo caption parsing", () => {
  it("extracts captions from fenced JSON and caps/dedupes/normalizes", () => {
    const text =
      "```json\n{\"captions\": [\"  Anna works at a clinic \", \"anna works at a CLINIC\", \"Anna had a long shift\", \"fourth caption\", \"fifth caption\"]}\n```";
    // The duplicate (case-insensitive) is dropped; the cap of 3 then keeps the
    // next two distinct captions.
    expect(parseCaptionsFromModel(text)).toEqual([
      "Anna works at a clinic",
      "Anna had a long shift",
      "fourth caption",
    ]);
  });

  it("strips <think> blocks before parsing", () => {
    const text = "<think>let me think</think>\n{\"captions\": [\"a fact\"]}";
    expect(parseCaptionsFromModel(text)).toEqual(["a fact"]);
  });

  it("returns [] on unparseable or shapeless output (neutral fallback, never throws)", () => {
    expect(parseCaptionsFromModel("sorry I cannot help")).toEqual([]);
    expect(parseCaptionsFromModel("{\"notCaptions\": 1}")).toEqual([]);
    expect(parseCaptionsFromModel("{ broken json")).toEqual([]);
  });
});

describe("LoCoMo caption enrichment + windowing", () => {
  it("keeps raw text and appends captions; raw-only when no captions", () => {
    expect(enrichTurnContent("raw turn", ["cap a", "cap b"])).toBe(
      "Original dialog:\nraw turn\n\nSemantic caption:\ncap a\ncap b",
    );
    expect(enrichTurnContent("raw turn", [])).toBe("raw turn");
  });

  it("builds the +-radius window clamped at conversation edges", () => {
    const turns = SAMPLE_CASE.turns;
    expect(buildLocalWindow(turns, 0, 2).map((t) => t.diaId)).toEqual(["D1:1", "D1:2", "D1:3"]);
    expect(buildLocalWindow(turns, 2, 1).map((t) => t.diaId)).toEqual(["D1:2", "D1:3"]);
  });
});

describe("LoCoMo captioned-case builder", () => {
  it("enriches turns, preserves diaId/questions/evidence, and never leaks Q/gold to the captioner", async () => {
    const seenPrompts: string[] = [];
    const seenInputs: CaptionerInput[] = [];
    const captioner: Captioner = async (input) => {
      seenInputs.push(input);
      seenPrompts.push(buildCaptionUserPrompt(input));
      return [`caption for ${input.centerTurn.diaId}`];
    };

    const result = await buildCaptionedCase({
      captioner,
      concurrency: 2,
      mode: "turn-only",
      testCase: SAMPLE_CASE,
      windowRadius: 2,
    });

    // diaIds and order preserved.
    expect(result.captionedCase.turns.map((t) => t.diaId)).toEqual(["D1:1", "D1:2", "D1:3"]);
    // Each turn keeps its raw text and gains its caption.
    expect(result.captionedCase.turns[1]?.content).toBe(
      "Original dialog:\nlong shift at the clinic again\n\nSemantic caption:\ncaption for D1:2",
    );
    // Questions pass through byte-for-byte (same wording + evidence ids).
    expect(result.captionedCase.questions).toEqual(SAMPLE_CASE.questions);
    expect(result.captionedTurnCount).toBe(3);
    expect(result.captionFailureCount).toBe(0);

    // LEAKAGE GUARD: the captioner only ever saw dialog-turn content. No
    // question text, gold answer, adversarial answer, or evidence id appeared in
    // any prompt or input it received.
    const forbidden = [
      "Where does Anna work?",
      "a downtown clinic",
      "What is Bob's secret diagnosis?",
      "No information available",
      "a hospital in Berlin",
      "q0",
      "q1",
    ];
    const haystack = JSON.stringify({ seenPrompts, seenInputs });
    for (const needle of forbidden) {
      expect(haystack).not.toContain(needle);
    }
  });

  it("counts a caption failure (empty result) and leaves that turn at baseline text", async () => {
    const captioner: Captioner = async (input) =>
      input.centerTurn.diaId === "D1:2" ? [] : ["ok"];
    const result = await buildCaptionedCase({
      captioner,
      concurrency: 1,
      mode: "turn-only",
      testCase: SAMPLE_CASE,
      windowRadius: 2,
    });
    expect(result.captionFailureCount).toBe(1);
    expect(result.captionedCase.turns[1]?.content).toBe("long shift at the clinic again");
  });

  it("local-window-2 prompt marks the center turn and includes neighbors", async () => {
    const captioner: Captioner = async (input) => [`c:${input.centerTurn.diaId}`];
    let centerPrompt = "";
    const wrapped: Captioner = async (input) => {
      if (input.centerTurn.diaId === "D1:2") {
        centerPrompt = buildCaptionUserPrompt(input);
      }
      return captioner(input);
    };
    await buildCaptionedCase({
      captioner: wrapped,
      concurrency: 1,
      mode: "local-window-2",
      testCase: SAMPLE_CASE,
      windowRadius: 2,
    });
    expect(centerPrompt).toContain(">> CENTER >> Anna: long shift at the clinic again");
    expect(centerPrompt).toContain("Bob: hey how was your day");
    expect(centerPrompt).toContain("Bob: Max kept me up all night");
  });
});

describe("LoCoMo captioned-root IO wrapper", () => {
  it("writes captioned cases + audit metadata and reuses a resumable cache", async () => {
    const files = new Map<string, string>();
    files.set(
      "/src/cases.json",
      JSON.stringify({ cases: [SAMPLE_CASE] }),
    );
    let captionerCalls = 0;
    const captioner: Captioner = async (input) => {
      captionerCalls += 1;
      return [`cap-${input.centerTurn.diaId}`];
    };
    const io = {
      appendFile: async (path: string, data: string) => {
        files.set(path, (files.get(path) ?? "") + data);
      },
      mkdir: async () => undefined,
      readFile: async (path: string) => {
        const value = files.get(path);
        if (value === undefined) {
          throw new Error(`ENOENT ${path}`);
        }
        return value;
      },
      writeFile: async (path: string, data: string) => {
        files.set(path, data);
      },
    };

    const first = await prepareCaptionedRoot({
      ...io,
      captioner,
      concurrency: 2,
      mode: "turn-only",
      modelLabel: "openai:test-model",
      outputRoot: "/out",
      sourceRoot: "/src",
      windowRadius: 2,
    });

    expect(first.turnCount).toBe(3);
    expect(first.captionedTurnCount).toBe(3);
    expect(first.captionFailureCount).toBe(0);
    expect(captionerCalls).toBe(3);

    const writtenCases = JSON.parse(files.get("/out/cases.json") as string) as {
      cases: LocomoCase[];
    };
    expect(writtenCases.cases[0]?.turns[0]?.content).toContain("Semantic caption:\ncap-D1:1");
    expect(writtenCases.cases[0]?.questions).toEqual(SAMPLE_CASE.questions);

    const metadata = JSON.parse(
      files.get("/out/phase-65-caption-metadata.json") as string,
    ) as { captionsByDiaId: Record<string, string[]>; mode: string; leakageGuard: string };
    expect(metadata.mode).toBe("turn-only");
    expect(metadata.captionsByDiaId["D1:2"]).toEqual(["cap-D1:2"]);
    expect(metadata.leakageGuard).toContain("never supplied");

    // Resume: a second run reads the JSONL cache and re-captions nothing.
    const second = await prepareCaptionedRoot({
      ...io,
      captioner,
      concurrency: 2,
      mode: "turn-only",
      modelLabel: "openai:test-model",
      outputRoot: "/out",
      sourceRoot: "/src",
      windowRadius: 2,
    });
    expect(second.captionedTurnCount).toBe(3);
    expect(captionerCalls).toBe(3); // unchanged — all served from cache
  });
});
