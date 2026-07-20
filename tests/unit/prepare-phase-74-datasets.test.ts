import { describe, expect, it } from "bun:test";

import {
  normalizePhase74LocomoSource,
  parsePhase74DatasetPrepOptions,
  preparePhase74FrozenDataset,
  relativePhase74DatasetPath,
} from "../../scripts/prepare-phase-74-datasets";

describe("Phase 74 frozen dataset preparation", () => {
  it("requires one canonical benchmark and an explicit external output root", () => {
    expect(parsePhase74DatasetPrepOptions([
      "bun",
      "prepare-phase-74-datasets.ts",
      "--benchmark",
      "locomo",
      "--output-root",
      "/private/tmp/phase74/locomo",
    ])).toEqual({
      benchmark: "locomo",
      outputRoot: "/private/tmp/phase74/locomo",
    });
    expect(() => parsePhase74DatasetPrepOptions([
      "bun",
      "prepare-phase-74-datasets.ts",
      "--benchmark",
      "locomo",
      "--benchmark",
      "longmemeval",
      "--output-root",
      "/tmp/data",
    ])).toThrow("--benchmark cannot be specified more than once");
    expect(() => parsePhase74DatasetPrepOptions([
      "bun",
      "prepare-phase-74-datasets.ts",
      "--benchmark",
      "longmemeval",
    ])).toThrow("--output-root must be provided exactly once");
    expect(() => parsePhase74DatasetPrepOptions([
      "bun",
      "prepare-phase-74-datasets.ts",
      "--benchmark",
      "locomo",
      "--output-root",
      "--source-file",
      "/tmp/locomo10.json",
    ])).toThrow("--output-root requires a value");
    expect(() => parsePhase74DatasetPrepOptions([
      "bun",
      "prepare-phase-74-datasets.ts",
      "--benchmark",
      "locomo",
      "--output-root",
      "/tmp/data",
      "--source-file",
      "--benchmark-root",
      "/tmp/other",
    ])).toThrow("--source-file requires a value");
  });

  it("retains upstream image captions and normalizes session timestamps", () => {
    const cases = normalizePhase74LocomoSource(JSON.stringify([{
      conversation: {
        session_1: [{
          blip_caption: "Pepper running beside a lake",
          dia_id: "D1:1",
          speaker: "Caroline",
          text: "Pepper had a great morning.",
        }],
        session_1_date_time: "1:56 pm on 8 May, 2023",
        speaker_a: "Caroline",
        speaker_b: "Melanie",
      },
      qa: [{
        answer: "Pepper",
        category: 4,
        evidence: ["D1:1"],
        question: "Who had a great morning?",
      }],
      sample_id: "conversation-1",
    }]));

    expect(cases[0]?.turns[0]).toMatchObject({
      content: "Pepper had a great morning.\n\nImage caption: Pepper running beside a lake",
      date: "2023-05-08T13:56:00.000Z",
    });
  });

  it("checks the pinned source before creating or writing the external root", async () => {
    const writes: string[] = [];
    await expect(preparePhase74FrozenDataset({
      benchmark: "longmemeval",
      outputRoot: "/tmp/phase74-test",
    }, {
      fetchText: async () => "drifted source",
      mkdir: async (path) => {
        writes.push(`mkdir:${path}`);
      },
      writeFile: async (path) => {
        writes.push(`write:${path}`);
      },
    })).rejects.toThrow("source SHA-256 mismatch");
    expect(writes).toEqual([]);
  });

  it("writes a stable relative data path when the output root has a trailing slash", () => {
    expect(relativePhase74DatasetPath(
      "/tmp/phase74/locomo/",
      "/tmp/phase74/locomo/cases.json",
    )).toBe("cases.json");
  });

  it("rejects data paths outside the output root", () => {
    expect(() => relativePhase74DatasetPath(
      "/tmp/phase74/locomo",
      "/tmp/phase74/cases.json",
    )).toThrow("must remain inside the output root");
  });
});
