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
  });
});
