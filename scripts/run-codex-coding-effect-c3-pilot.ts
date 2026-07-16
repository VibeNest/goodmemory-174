import {
  cleanupC3ControlledPilotFixture,
  prepareC3ControlledPilotFixture,
} from "./codex-coding-effect/c3-controlled-pilot";
import { runC3FrozenPrehistoryPair } from "./codex-coding-effect/c3-pair-runner";
import { parseCodexC3PilotOptions } from "./codex-coding-effect/c3-pilot-options";

async function main(): Promise<void> {
  const options = parseCodexC3PilotOptions(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const fixture = await prepareC3ControlledPilotFixture({
    root: options.fixtureRoot,
  });
  try {
    const result = await runC3FrozenPrehistoryPair({
      authFile: options.authFile,
      bunExecutable: options.bunBinary,
      codexExecutable: options.codexBinary,
      declaredForbiddenSourceSha256:
        fixture.declaredForbiddenSourceSha256,
      episodeId: "controlled-transport-mode",
      evaluatorFiles: fixture.evaluatorFiles,
      evaluatorRoot: fixture.evaluatorRoot,
      expectedCommit: fixture.expectedCommit,
      failToPassCommand: fixture.failToPassCommand,
      forbiddenPaths: [".goodmemory", "evaluator"],
      forbiddenSources: fixture.forbiddenSources,
      forbiddenStrings: fixture.forbiddenStrings,
      generatedAt,
      historySourcePath: fixture.historySourcePath,
      historySourceSha256: fixture.historySourceSha256,
      materializeEvaluator: fixture.materializeEvaluator,
      materializePrehistory: fixture.materializePrehistory,
      model: options.codexModel,
      npmExecutable: options.npmBinary,
      onLog: (event) => {
        process.stderr.write(`[c3] ${JSON.stringify(event)}\n`);
      },
      outputDirectory: options.runOutputDir,
      packageTarball: options.packageTarball,
      passToPassCommand: fixture.passToPassCommand,
      prompt: fixture.prompt,
      reasoningEffort: options.reasoningEffort,
      repetition: 1,
      runId: options.runId,
      runtimeRoot: options.runtimeRoot,
      seed: 1,
      sourceRepository: fixture.sourceRepository,
      stageId: "stage-1",
      stageTimeoutMs: options.stageTimeoutMs,
      testTimeoutMs: options.testTimeoutMs,
      workspaceRoot: options.workspaceRoot,
    });
    process.stdout.write(result.summaryBytes);
  } finally {
    await cleanupC3ControlledPilotFixture(fixture);
  }
}

await main();
