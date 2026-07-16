import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  cleanupC4ControlledPilotDataset,
  prepareC4ControlledPilotDataset,
} from "./codex-coding-effect/c4-controlled-dataset";

const DEFAULT_OUTPUT = resolve(
  "fixtures/codex-coding-effect/c4-controlled-pilot",
);

export async function freezeC4ControlledPilotDataset(input: {
  outputRoot: string;
  replace?: boolean;
}): Promise<{
  assetLockSha256: string;
  assetRootSha256: string;
  manifestEpisodeCount: number;
  outputRoot: string;
}> {
  const parent = await mkdtemp(join(tmpdir(), "goodmemory-c4-freeze-"));
  const fixture = await prepareC4ControlledPilotDataset({
    root: join(parent, "dataset"),
  });
  try {
    const outputRoot = resolve(input.outputRoot);
    if (input.replace) {
      const existing = JSON.parse(
        await readFile(join(outputRoot, "manifest.json"), "utf8"),
      ) as { datasetId?: unknown };
      if (existing.datasetId !== "codex-c4-controlled-pilot-v1") {
        throw new Error("refusing to replace a non-C4 dataset directory");
      }
      await rm(outputRoot, { recursive: true });
    }
    await cp(fixture.root, outputRoot, {
      filter: (source) => basename(source) !==
        ".goodmemory-c4-controlled-dataset-owned",
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    return {
      assetLockSha256: fixture.assetLockSha256,
      assetRootSha256: fixture.assetLock.assetRootSha256,
      manifestEpisodeCount: fixture.dataset.episodes.length,
      outputRoot,
    };
  } finally {
    await cleanupC4ControlledPilotDataset(fixture);
    await rm(parent, { force: true, recursive: true });
  }
}

function parseOptions(args: readonly string[]): {
  outputRoot: string;
  replace: boolean;
} {
  let outputRoot = DEFAULT_OUTPUT;
  let replace = false;
  for (const argument of args) {
    if (argument === "--replace") {
      replace = true;
    } else if (argument.startsWith("--output=")) {
      outputRoot = resolve(argument.slice("--output=".length));
    } else {
      throw new Error(`unknown C4 freeze argument ${argument}`);
    }
  }
  return { outputRoot, replace };
}

if (import.meta.main) {
  const result = await freezeC4ControlledPilotDataset(
    parseOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result, null, 2));
}
