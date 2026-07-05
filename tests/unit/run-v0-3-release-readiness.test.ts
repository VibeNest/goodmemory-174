import { describe, expect, it } from "bun:test";
import {
  parseReleaseReadinessCliOptions,
  renderSummary,
  type ReleaseReadinessReport,
} from "../../scripts/run-v0-3-release-readiness";

function report(overrides: Partial<ReleaseReadinessReport> = {}): ReleaseReadinessReport {
  return {
    // default fixture has a required failing check (pack), so the gate verdict
    // is a failure unless an override says otherwise.
    allRequiredPassed: false,
    checks: [
      {
        detail: "tsc --noEmit clean",
        durationMs: 1200,
        id: "typecheck",
        required: true,
        status: "pass",
        title: "TypeScript typecheck",
      },
      {
        detail: "skipped via --skip-tests",
        durationMs: 0,
        id: "unit-tests",
        required: false,
        status: "skip",
        title: "Unit test suite",
      },
      {
        detail: "tarball missing: dist/http/index.js | extra pipe",
        durationMs: 800,
        id: "pack",
        required: true,
        status: "fail",
        title: "npm pack file manifest",
      },
    ],
    generatedAt: "2026-06-23T00:00:00.000Z",
    generatedBy: "scripts/run-v0-3-release-readiness.ts",
    packageVersion: "0.3.5",
    phase: "phase-66",
    summary: { failed: 1, passed: 1, skipped: 1, total: 3 },
    ...overrides,
  };
}

describe("v0.3 release-readiness summary", () => {
  it("rejects duplicate CLI mode and output flags before running checks", () => {
    expect(() =>
      parseReleaseReadinessCliOptions([
        "bun",
        "run",
        "scripts/run-v0-3-release-readiness.ts",
        "--skip-build",
        "--skip-build",
      ]),
    ).toThrow("--skip-build cannot be specified more than once.");

    expect(() =>
      parseReleaseReadinessCliOptions([
        "bun",
        "run",
        "scripts/run-v0-3-release-readiness.ts",
        "--skip-tests",
        "--skip-tests",
      ]),
    ).toThrow("--skip-tests cannot be specified more than once.");

    expect(() =>
      parseReleaseReadinessCliOptions([
        "bun",
        "run",
        "scripts/run-v0-3-release-readiness.ts",
        "--strict",
        "--strict",
      ]),
    ).toThrow("--strict cannot be specified more than once.");

    expect(() =>
      parseReleaseReadinessCliOptions([
        "bun",
        "run",
        "scripts/run-v0-3-release-readiness.ts",
        "--output-dir",
        "/tmp/release-a",
        "--output-dir",
        "/tmp/release-b",
      ]),
    ).toThrow("--output-dir cannot be specified more than once.");
  });

  it("renders a markdown table with one row per check and escapes pipes", () => {
    const markdown = renderSummary(report());
    expect(markdown).toContain("# v0.3 Release Readiness");
    expect(markdown).toContain("- package version: 0.3.5");
    expect(markdown).toContain("| TypeScript typecheck | yes | PASS |");
    expect(markdown).toContain("| Unit test suite | no | SKIP |");
    // pipe inside a detail must be escaped so it does not break the table.
    expect(markdown).toContain("dist/http/index.js \\| extra pipe");
    // one header row + separator + three check rows.
    const rows = markdown.split("\n").filter((line) => line.startsWith("| "));
    expect(rows).toHaveLength(1 + 3);
  });

  it("reports the overall verdict from allRequiredPassed and the summary counts", () => {
    expect(renderSummary(report())).toContain("REQUIRED CHECK(S) FAILED (1 pass / 1 fail / 1 skip)");
    expect(
      renderSummary(report({ allRequiredPassed: true, summary: { failed: 0, passed: 3, skipped: 0, total: 3 } })),
    ).toContain("ALL REQUIRED CHECKS PASS");
  });

  it("documents the Bun-runtime caveat for the published CLI", () => {
    expect(renderSummary(report())).toContain("delegates execution to Bun");
  });
});
