import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseC5ReadinessOptions,
  runC5ReadinessCommand,
} from "../../scripts/prepare-codex-coding-effect-c5-pilot";

describe("Codex coding-effect C5 readiness CLI", () => {
  it("pins the accepted C4 inputs and requires an explicit order seed", () => {
    expect(parseC5ReadinessOptions([
      "--material-effect-pp=10",
      "--order-seed=73",
    ])).toMatchObject({
      baselineReportPath:
        "reports/quality-gates/phase-73/c4-baseline-ceiling-pilot/report.json",
      baselineRawStageEvidenceRoot:
        "reports/quality-gates/phase-73/c4-baseline-ceiling-pilot/raw-stages",
      baselineStageEvidenceRoot:
        "reports/quality-gates/phase-73/c4-baseline-ceiling-pilot/stages",
      c4ReadinessCorePath:
        "reports/quality-gates/phase-73/c4-controlled-pilot-core.json",
      c4ReadinessReportPath:
        "reports/quality-gates/phase-73/c4-controlled-pilot-readiness.json",
      c4ReadinessWorkspaceRoot: join(
        tmpdir(),
        `goodmemory-c5-readiness-${process.pid}`,
      ),
      c4ReviewDispatchPath:
        "fixtures/codex-coding-effect/c4-controlled-pilot/review/dispatch.json",
      c4ReviewInputBundlePath:
        "fixtures/codex-coding-effect/c4-controlled-pilot/review/input-bundle.json",
      c4ReviewProvenancePath:
        "fixtures/codex-coding-effect/c4-controlled-pilot/review/provenance.json",
      c4ReviewRequestPath:
        "fixtures/codex-coding-effect/c4-controlled-pilot/review/request.md",
      c4ReviewResponsePath:
        "fixtures/codex-coding-effect/c4-controlled-pilot/review/independent-review.json",
      datasetRoot: "fixtures/codex-coding-effect/c4-controlled-pilot",
      materialEffectPercentagePoints: 10,
      orderSeed: 73,
    });
    expect(parseC5ReadinessOptions([
      "--baseline-report=/custom/run/report.json",
      "--material-effect-pp=10",
      "--order-seed=73",
    ])).toMatchObject({
      baselineRawStageEvidenceRoot: "/custom/run/raw-stages",
      baselineStageEvidenceRoot: "/custom/run/stages",
    });
    expect(parseC5ReadinessOptions([
      "--baseline-raw-stage-evidence=/evidence/run-v9/stages",
      "--material-effect-pp=10",
      "--order-seed=73",
    ]).baselineRawStageEvidenceRoot).toBe("/evidence/run-v9/stages");
    expect(() => parseC5ReadinessOptions([])).toThrow(
      "C5 readiness requires --order-seed",
    );
    expect(() => parseC5ReadinessOptions(["--order-seed=73"])).toThrow(
      "C5 readiness requires --material-effect-pp",
    );
  });

  it("rejects duplicate, malformed, and unknown options", () => {
    expect(() => parseC5ReadinessOptions([
      "--order-seed=73",
      "--order-seed=74",
    ])).toThrow("duplicate C5 readiness option --order-seed");
    expect(() => parseC5ReadinessOptions(["--order-seed=01"])).toThrow(
      "--order-seed must be a canonical positive integer",
    );
    expect(() => parseC5ReadinessOptions([
      "--material-effect-pp=10",
      "--order-seed=73",
      "--mystery=value",
    ])).toThrow("unknown C5 readiness option --mystery");
  });

  it("dispatches the frozen analysis inputs without writing artifacts", async () => {
    const expected = new Error("readiness-loader-called");
    let received: unknown;
    await expect(runC5ReadinessCommand([
      "--material-effect-pp=10",
      "--order-seed=73",
    ], async (input) => {
      received = input;
      throw expected;
    })).rejects.toBe(expected);
    expect(received).toMatchObject({
      materialEffectPercentagePoints: 10,
      orderSeed: 73,
    });
  });
});
