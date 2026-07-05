import { describe, expect, it } from "bun:test";
import {
  assertDistinctCliPathValues,
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
});
