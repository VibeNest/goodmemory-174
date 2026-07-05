import { describe, expect, it } from "bun:test";
import {
  assertDistinctCliPathValues,
  parseCliPathListFlagStrict,
  parseCliPositiveIntegerFlagStrict,
  resolveCliPathSegmentFlagValueStrict,
  resolveCliFlagValueStrict,
} from "../../scripts/cli-options";

describe("CLI option helpers", () => {
  it("rejects duplicate strict scalar flags instead of ignoring later values", () => {
    expect(() =>
      resolveCliFlagValueStrict(
        [
          "bun",
          "run",
          "scripts/reanswer-phase-65-locomo-report.ts",
          "--source-report",
          "/reports/source-a.json",
          "--source-report",
          "/reports/source-b.json",
        ],
        "--source-report",
      ),
    ).toThrow("--source-report cannot be specified more than once.");
  });

  it("rejects empty or whitespace-padded strict scalar values", () => {
    for (const value of [" ", " run-id", "run-id "]) {
      expect(() =>
        resolveCliFlagValueStrict(
          [
            "bun",
            "run",
            "scripts/run-phase-63-eval.ts",
            "--run-id",
            value,
          ],
          "--run-id",
        ),
      ).toThrow("--run-id cannot be empty or whitespace-padded.");
    }
  });

  it("rejects path-equivalent paired CLI values", () => {
    expect(() =>
      assertDistinctCliPathValues({
        firstFlag: "--baseline-report",
        firstValue: "/reports/open-domain/smoke-report.json",
        secondFlag: "--candidate-report",
        secondValue: "/reports/open-domain/../open-domain/smoke-report.json",
      }),
    ).toThrow(
      "--baseline-report and --candidate-report must refer to different paths",
    );

    expect(() =>
      assertDistinctCliPathValues({
        firstFlag: "--baseline-report",
        firstValue: "/reports/open-domain/smoke-report.json",
        secondFlag: "--candidate-report",
        secondValue: "/reports/multihop/smoke-report.json",
      }),
    ).not.toThrow();
  });

  it("rejects whitespace-padded path-list flag values", () => {
    expect(() =>
      parseCliPathListFlagStrict(
        [
          "bun",
          "run",
          "scripts/summarize-phase-65-locomo-categories.ts",
          "--report",
          "/reports/source-a.json, /reports/source-b.json",
        ],
        "--report",
      ),
    ).toThrow(
      "--report contains whitespace-padded value /reports/source-b.json.",
    );
  });

  it("parses only canonical positive integer flag values", () => {
    expect(
      parseCliPositiveIntegerFlagStrict(
        ["bun", "run", "scripts/run-phase-64-memory-agent-bench-smoke.ts"],
        "--limit",
      ),
    ).toBeUndefined();
    expect(
      parseCliPositiveIntegerFlagStrict(
        [
          "bun",
          "run",
          "scripts/run-phase-64-memory-agent-bench-smoke.ts",
          "--limit",
          "25",
        ],
        "--limit",
      ),
    ).toBe(25);

    for (const value of ["0", "-1", "1e2", "2.0", "02"]) {
      expect(() =>
        parseCliPositiveIntegerFlagStrict(
          [
            "bun",
            "run",
            "scripts/run-phase-64-memory-agent-bench-smoke.ts",
            "--limit",
            value,
          ],
          "--limit",
        ),
      ).toThrow("--limit must be a positive integer.");
    }
  });

  it("rejects path-like strict segment values", () => {
    expect(
      resolveCliPathSegmentFlagValueStrict(
        [
          "bun",
          "run",
          "scripts/run-phase-65-locomo-query-expansion.ts",
          "--run-id",
          "locomo-query-probe",
        ],
        "--run-id",
      ),
    ).toBe("locomo-query-probe");

    for (const value of ["../escape", "nested/run", "nested\\run", ".", ".."]) {
      expect(() =>
        resolveCliPathSegmentFlagValueStrict(
          [
            "bun",
            "run",
            "scripts/run-phase-65-locomo-query-expansion.ts",
            "--run-id",
            value,
          ],
          "--run-id",
        ),
      ).toThrow("--run-id must be a single path segment.");
    }
  });
});
