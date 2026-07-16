import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import {
  runC4DatasetCoreReadiness,
} from "./codex-coding-effect/c4-readiness";

const DEFAULT_DATASET_ROOT = resolve(
  "fixtures/codex-coding-effect/c4-controlled-pilot",
);
const DEFAULT_CORE_OUTPUT = resolve(
  "reports/quality-gates/phase-73/c4-controlled-pilot-core.json",
);

export async function runC4CoreReadiness(input: {
  coreOutput: string;
  datasetRoot: string;
}): Promise<{ coreOutput: string; coreSha256: string; status: "accepted" }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "goodmemory-c4-core-"));
  const workspaceRoot = join(temporaryRoot, "readiness");
  try {
    const result = await runC4DatasetCoreReadiness({
      datasetRoot: input.datasetRoot,
      workspaceRoot,
    });
    await writeOutput(input.coreOutput, result.coreBytes);
    return {
      coreOutput: input.coreOutput,
      coreSha256: result.coreSha256,
      status: "accepted",
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function parseOptions(args: readonly string[]): {
  coreOutput: string;
  datasetRoot: string;
} {
  let coreOutput = DEFAULT_CORE_OUTPUT;
  let datasetRoot = DEFAULT_DATASET_ROOT;
  for (const argument of args) {
    if (argument.startsWith("--core-output=")) {
      coreOutput = resolve(argument.slice("--core-output=".length));
    } else if (argument.startsWith("--dataset-root=")) {
      datasetRoot = resolve(argument.slice("--dataset-root=".length));
    } else {
      throw new Error(`unknown C4 core readiness argument ${argument}`);
    }
  }
  return { coreOutput, datasetRoot };
}

async function writeOutput(path: string, bytes: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

if (import.meta.main) {
  const result = await runC4CoreReadiness(parseOptions(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
