import { describe, expect, it } from "bun:test";
import {
  parsePhase37ExternalConsumerCliOptions,
  resolvePhase37ExternalConsumerOutputDir,
  runPhase37ExternalConsumerSmoke,
} from "../../scripts/run-phase-37-external-consumer";

describe("run-phase-37 external consumer script", () => {
  it("resolves the phase-37 external consumer output directory", () => {
    expect(resolvePhase37ExternalConsumerOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-37",
    );
  });

  it("parses phase-37 external consumer cli flags", () => {
    expect(
      parsePhase37ExternalConsumerCliOptions([
        "bun",
        "run",
        "scripts/run-phase-37-external-consumer.ts",
        "--output-dir",
        "/tmp/phase37-external",
        "--run-id",
        "run-phase37-external",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase37-external",
      runId: "run-phase37-external",
    });
  });

  it("writes an accepted report when the external package smoke succeeds", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const removed: string[] = [];
    const commands: string[] = [];

    const report = await runPhase37ExternalConsumerSmoke(
      {
        outputDir: "/tmp/goodmemory/reports/eval/live-memory/phase-37",
        runId: "run-phase37-external",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        makeTempDir: async () => "/tmp/goodmemory-phase37-external",
        now: () => "2026-04-24T10:30:45.000Z",
        removeDir: async (path) => {
          removed.push(path);
        },
        runCommand: async (command) => {
          commands.push(command.label);
          if (command.label === "npm-pack") {
            return {
              durationMs: 1,
              exitCode: 0,
              stderr: "",
              stdout: "goodmemory-0.1.1.tgz\n",
            };
          }
          if (command.label === "consumer-codex-writeback") {
            return {
              durationMs: 1,
              exitCode: 0,
              stderr: "",
              stdout: JSON.stringify({
                trace: { rawTranscriptPersisted: false },
                wrote: true,
              }),
            };
          }
          if (command.label === "consumer-codex-user-prompt-submit") {
            return {
              durationMs: 1,
              exitCode: 0,
              stderr: "",
              stdout: JSON.stringify({
                hookSpecificOutput: {
                  additionalContext:
                    "Next step is to add the phase-37 external consumer report.",
                },
              }),
            };
          }

          return {
            durationMs: 1,
            exitCode: 0,
            stderr: "",
            stdout: "ok",
          };
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-37");
    expect(report.mode).toBe("external-consumer");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.installedPackageUsed).toBe(true);
    expect(report.evidence.manualSeedUsed).toBe(false);
    expect(report.evidence.wroteDurableMemory).toBe(true);
    expect(report.evidence.nextSessionRecallHit).toBe(true);
    expect(report.evidence.rawTranscriptPersisted).toBe(false);
    expect(commands).toEqual([
      "npm-pack",
      "consumer-install-package",
      "consumer-install-codex",
      "consumer-enable-codex",
      "consumer-codex-writeback",
      "consumer-codex-user-prompt-submit",
    ]);
    expect(directories).toContain(
      "/tmp/goodmemory/reports/eval/live-memory/phase-37/run-phase37-external",
    );
    expect(removed).toEqual(["/tmp/goodmemory-phase37-external"]);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
