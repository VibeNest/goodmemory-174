import { describe, expect, it } from "bun:test";
import {
  buildPhase63BeamRowsUrl,
  parsePhase63BeamPrepareCliOptions,
  preparePhase63BeamData,
} from "../../scripts/prepare-phase-63-beam-data";

function buildRowsResponse(): unknown {
  return {
    num_rows_per_page: 100,
    num_rows_total: 1,
    partial: false,
    rows: [
      {
        row: {
          chat: [],
          conversation_id: "1",
          conversation_plan: "BATCH 1 PLAN",
          conversation_seed: {
            category: "Coding",
            id: 1,
            subtopics: ["Flask"],
            theme: "Budget tracker",
            title: "Building a Flask App",
          },
          narratives: "Narratives",
          probing_questions: "{'abstention': []}",
          user_profile: {
            user_info: "USER PROFILE",
            user_relationships: "None",
          },
          user_questions: [],
        },
        row_idx: 0,
        truncated_cells: [],
      },
    ],
  };
}

describe("prepare-phase-63 BEAM data script", () => {
  it("parses the external-root preparation flags", () => {
    expect(
      parsePhase63BeamPrepareCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-63-beam-data.ts",
        "--output-root",
        "/tmp/BEAM",
        "--split",
        "100K",
        "--offset",
        "2",
        "--length",
        "20",
      ]),
    ).toEqual({
      dataset: "Mohammadta/BEAM",
      length: 20,
      offset: 2,
      outputRoot: "/tmp/BEAM",
      split: "100K",
    });
  });

  it("builds the Hugging Face rows endpoint URL", () => {
    expect(
      buildPhase63BeamRowsUrl({
        dataset: "Mohammadta/BEAM",
        length: 20,
        offset: 0,
        split: "100K",
      }),
    ).toBe(
      "https://datasets-server.huggingface.co/rows?dataset=Mohammadta%2FBEAM&config=default&split=100K&offset=0&length=20",
    );
  });

  it("writes an external-root JSON export without vendoring upstream rows", async () => {
    const writes = new Map<string, string>();
    const result = await preparePhase63BeamData(
      {
        dataset: "Mohammadta/BEAM",
        length: 20,
        offset: 0,
        outputRoot: "/tmp/BEAM",
        split: "100K",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-05-18T00:00:00.000Z"),
        requestJson: async () => buildRowsResponse(),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(result.dataFile).toBe("/tmp/BEAM/100K.json");
    expect(result.rowCount).toBe(1);
    expect(writes.has("/tmp/BEAM/100K.json")).toBe(true);
    expect(writes.has("/tmp/BEAM/phase-63-beam-export-metadata.json")).toBe(true);
    expect(JSON.parse(writes.get("/tmp/BEAM/100K.json") ?? "[]")).toEqual([
      buildRowsResponse().rows[0].row,
    ]);
  });

  it("rejects truncated rows responses before writing an incomplete export", async () => {
    await expect(
      preparePhase63BeamData(
        {
          dataset: "Mohammadta/BEAM",
          length: 20,
          offset: 0,
          outputRoot: "/tmp/BEAM",
          split: "100K",
        },
        {
          mkdir: async () => undefined,
          requestJson: async () => ({
            ...buildRowsResponse(),
            rows: [
              {
                row: {},
                row_idx: 0,
                truncated_cells: ["chat"],
              },
            ],
          }),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("truncated cells");
  });
});
