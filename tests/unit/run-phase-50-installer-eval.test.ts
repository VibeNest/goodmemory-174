import { describe, expect, it } from "bun:test";
import {
  parsePhase50InstallerEvalCliOptions,
  PHASE50_CANONICAL_RUN_ID,
  resolvePhase50InstallerEvalOutputDir,
  runPhase50InstallerEval,
} from "../../scripts/run-phase-50-installer-eval";

describe("run-phase-50 installer eval", () => {
  it("resolves output paths and parses cli flags", () => {
    expect(resolvePhase50InstallerEvalOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-50",
    );
    expect(
      parsePhase50InstallerEvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-50-installer-eval.ts",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase50",
      ]),
    ).toEqual({
      outputDir: "/tmp/out",
      runId: "run-phase50",
    });
  });

  it("generates accepted installer dry-run, doctor, and repair evidence", async () => {
    const writes = new Map<string, string>();
    const report = await runPhase50InstallerEval(
      {
        outputDir: "/tmp/goodmemory-phase50-eval",
        runId: PHASE50_CANONICAL_RUN_ID,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T22:30:00.000Z",
        writeTextFile: async (path, content) => {
          writes.set(path, content);
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.phase).toBe("phase-50");
    expect(report.scenarios.map((scenario) => scenario.name).sort()).toEqual([
      "default-writeback-off",
      "doctor-missing",
      "dry-run-no-mutation",
      "repair-managed-wiring",
    ]);
    expect(report.summary.dryRunDoesNotWrite).toBe(true);
    expect(report.summary.repairPreservesWriteback).toBe(true);
    expect(report.summary.repairRestoresManagedWiring).toBe(true);
    expect(report.summary.writebackDefaultEscalated).toBe(false);
    const defaultWritebackScenario = report.scenarios.find(
      (scenario) => scenario.name === "default-writeback-off",
    );
    expect(defaultWritebackScenario?.checks.installDefaultWritebackOff).toBe(true);
    expect(defaultWritebackScenario?.checks.setupCodexDefaultWritebackOff).toBe(true);
    expect(defaultWritebackScenario?.checks.setupClaudeDefaultWritebackOff).toBe(true);
    expect([...writes.keys()][0]).toContain("report.json");
  });
});
