import {
  parseCodexCodingEffectCliOptions,
} from "./codex-coding-effect/cli-options";
import type {
  CodexCodingEffectArm,
  CodexCodingEffectEvidenceClass,
} from "./codex-coding-effect/contracts";
import {
  loadCodexCodingEffectDataset,
  selectCodexCodingEffectEpisodes,
} from "./codex-coding-effect/dataset";

export interface CodexCodingEffectDryRunSelection {
  arms: readonly CodexCodingEffectArm[];
  datasetId: string;
  episodeIds: readonly string[];
  evidenceClass: CodexCodingEffectEvidenceClass;
  manifestPath: string;
  manifestSha256: string;
  repetitionCount: number;
  runId: string;
  schemaVersion: 1;
  seeds: readonly number[];
  stageIds: readonly string[];
}

export async function resolveCodexCodingEffectDryRun(
  argv: readonly string[],
): Promise<CodexCodingEffectDryRunSelection> {
  const options = parseCodexCodingEffectCliOptions(argv);
  if (!options.dryRun) {
    throw new Error("the C0 runner requires --dry-run");
  }

  const loaded = await loadCodexCodingEffectDataset(options.datasetRoot);
  const episodes = selectCodexCodingEffectEpisodes(loaded.dataset, {
    episodeIds: options.episodeIds,
    evidenceClass: options.evidenceClass,
  });
  const episodeIds = Object.freeze(episodes.map((episode) => episode.id));
  const stageIds = Object.freeze(episodes.flatMap((episode) =>
    episode.stages.map((stage) => `${episode.id}/${stage.id}`)
  ));

  return Object.freeze({
    arms: Object.freeze([...options.arms]),
    datasetId: loaded.dataset.datasetId,
    episodeIds,
    evidenceClass: options.evidenceClass,
    manifestPath: loaded.manifestPath,
    manifestSha256: loaded.manifestSha256,
    repetitionCount: options.repetitionCount,
    runId: options.runId,
    schemaVersion: 1,
    seeds: Object.freeze([...options.seeds]),
    stageIds,
  });
}

if (import.meta.main) {
  try {
    const selection = await resolveCodexCodingEffectDryRun(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(selection, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
