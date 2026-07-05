import { describe, expect, it } from "bun:test";
import { parseOfficialRescoreCliOptions } from "../../scripts/rescore-official-protocols";

describe("official protocol rescore CLI", () => {
  it("parses a canonical benchmark rescore command", () => {
    expect(
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "locomo",
        "--report",
        "/reports/locomo/smoke-report.json",
        "--root",
        "/private/tmp/LOCOMO-full/cases.json",
        "--run-id",
        "locomo-official-rescore-current",
        "--concurrency",
        "2",
        "--limit",
        "25",
      ]),
    ).toEqual({
      benchmark: "locomo",
      concurrency: 2,
      limit: 25,
      reportPath: "/reports/locomo/smoke-report.json",
      rootPath: "/private/tmp/LOCOMO-full/cases.json",
      runId: "locomo-official-rescore-current",
    });
  });

  it("rejects ambiguous or unsafe rescore selectors", () => {
    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "beam",
        "--benchmark",
        "locomo",
      ]),
    ).toThrow("--benchmark cannot be specified more than once.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "beam",
        "--run-id",
        "../beam-official",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "longmemeval",
        "--limit",
        "1.5",
      ]),
    ).toThrow("--limit must be a positive integer.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "unknown",
      ]),
    ).toThrow("--benchmark must be longmemeval, locomo, or beam.");
  });
});
