import { describe, expect, it } from "bun:test";
import { parseLocomoQueryExpansionCliOptions } from "../../scripts/run-phase-65-locomo-query-expansion";
import { parseLocomoWindowRetrievalCliOptions } from "../../scripts/run-phase-65-locomo-window-retrieval";

describe("phase-65 LoCoMo retrieval probe CLI guards", () => {
  it("parses query-expansion scope and rejects duplicate scalar flags", () => {
    expect(
      parseLocomoQueryExpansionCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-query-expansion.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--run-id",
        "query-probe",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/LOCOMO",
      runId: "query-probe",
    });

    expect(() =>
      parseLocomoQueryExpansionCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-query-expansion.ts",
        "--benchmark-root",
        "/tmp/LOCOMO-a",
        "--benchmark-root",
        "/tmp/LOCOMO-b",
      ]),
    ).toThrow("--benchmark-root cannot be specified more than once.");

    expect(() =>
      parseLocomoQueryExpansionCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-query-expansion.ts",
        "--run-id",
        "first",
        "--run-id",
        "second",
      ]),
    ).toThrow("--run-id cannot be specified more than once.");

    expect(() =>
      parseLocomoQueryExpansionCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-query-expansion.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--run-id",
        "../outside-reports",
      ]),
    ).toThrow("--run-id must be a single path segment.");
  });

  it("rejects empty or whitespace-padded LoCoMo root environment values for query expansion", () => {
    const original = process.env.GOODMEMORY_LOCOMO_ROOT;
    try {
      process.env.GOODMEMORY_LOCOMO_ROOT = "/tmp/LOCOMO-env";
      expect(
        parseLocomoQueryExpansionCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-query-expansion.ts",
        ]).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-env");

      expect(
        parseLocomoQueryExpansionCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-query-expansion.ts",
          "--benchmark-root",
          "/tmp/LOCOMO-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-cli");

      process.env.GOODMEMORY_LOCOMO_ROOT = " /tmp/LOCOMO-env ";
      expect(() =>
        parseLocomoQueryExpansionCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-query-expansion.ts",
        ]),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");

      process.env.GOODMEMORY_LOCOMO_ROOT = "";
      expect(() =>
        parseLocomoQueryExpansionCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-query-expansion.ts",
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

  it("parses window-retrieval scope and rejects duplicate scalar flags", () => {
    expect(
      parseLocomoWindowRetrievalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-window-retrieval.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--window-radius",
        "3",
        "--run-id",
        "window-probe",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/LOCOMO",
      radius: 3,
      runId: "window-probe",
    });

    for (const flagName of [
      "--benchmark-root",
      "--run-id",
      "--window-radius",
    ]) {
      expect(() =>
        parseLocomoWindowRetrievalCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-window-retrieval.ts",
          flagName,
          "first",
          flagName,
          "second",
        ]),
      ).toThrow(`${flagName} cannot be specified more than once.`);
    }

    for (const radius of ["0", "-1", "1.5", "1e2", "abc"]) {
      expect(() =>
        parseLocomoWindowRetrievalCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-window-retrieval.ts",
          "--benchmark-root",
          "/tmp/LOCOMO",
          "--window-radius",
          radius,
        ]),
      ).toThrow("--window-radius must be a positive integer.");
    }

    expect(() =>
      parseLocomoWindowRetrievalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-window-retrieval.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--window-radius",
        "--run-id",
        "window-probe",
      ]),
    ).toThrow("--window-radius requires a value.");

    expect(() =>
      parseLocomoWindowRetrievalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-window-retrieval.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--run-id",
        "nested/window-probe",
      ]),
    ).toThrow("--run-id must be a single path segment.");
  });

  it("rejects empty or whitespace-padded LoCoMo root environment values for window retrieval", () => {
    const original = process.env.GOODMEMORY_LOCOMO_ROOT;
    try {
      process.env.GOODMEMORY_LOCOMO_ROOT = "/tmp/LOCOMO-env";
      expect(
        parseLocomoWindowRetrievalCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-window-retrieval.ts",
        ]).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-env");

      expect(
        parseLocomoWindowRetrievalCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-window-retrieval.ts",
          "--benchmark-root",
          "/tmp/LOCOMO-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-cli");

      process.env.GOODMEMORY_LOCOMO_ROOT = " /tmp/LOCOMO-env ";
      expect(() =>
        parseLocomoWindowRetrievalCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-window-retrieval.ts",
        ]),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");

      process.env.GOODMEMORY_LOCOMO_ROOT = "";
      expect(() =>
        parseLocomoWindowRetrievalCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-window-retrieval.ts",
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
});
