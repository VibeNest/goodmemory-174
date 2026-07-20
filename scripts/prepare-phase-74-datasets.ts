import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  assertPhase74FrozenDataset,
  createPhase74LocomoDataset,
  createPhase74LongMemEvalDataset,
  PHASE74_FROZEN_DATASET_SOURCES,
  verifyPhase74DatasetSource,
} from "../src/eval/phase74Datasets";
import type {
  Phase74BenchmarkFamily,
  Phase74DatasetBundle,
} from "../src/eval/phase74Datasets";
import type { LocomoCase } from "../src/eval/locomo";
import { normalizeLocomoPrepCases } from "./prepare-phase-65-locomo-data";
import { resolveCliFlagValueStrict } from "./cli-options";

export interface Phase74DatasetPrepOptions {
  benchmark: Phase74BenchmarkFamily;
  outputRoot: string;
  sourceFile?: string;
}

export interface Phase74DatasetPrepDependencies {
  fetchText?(url: string): Promise<string>;
  mkdir?(path: string): Promise<unknown>;
  readFile?(path: string): Promise<string>;
  writeFile?(path: string, data: string): Promise<unknown>;
}

function requiredSingleFlag(
  argv: readonly string[],
  flag: string,
): string {
  const value = resolveCliFlagValueStrict(argv, flag);
  if (value === undefined) {
    throw new Error(`${flag} must be provided exactly once.`);
  }
  return value;
}

export function normalizePhase74LocomoSource(raw: string): LocomoCase[] {
  return normalizeLocomoPrepCases(JSON.parse(raw), {
    includeImageCaptions: true,
    maxConversations: 0,
    maxQuestionsPerCase: 0,
  });
}

export function parsePhase74DatasetPrepOptions(
  argv: readonly string[],
): Phase74DatasetPrepOptions {
  const benchmark = requiredSingleFlag(argv, "--benchmark");
  if (benchmark !== "longmemeval" && benchmark !== "locomo") {
    throw new Error("--benchmark must be longmemeval or locomo.");
  }
  const outputRoot = requiredSingleFlag(argv, "--output-root");
  const sourceFile = resolveCliFlagValueStrict(argv, "--source-file");
  return {
    benchmark,
    outputRoot,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  };
}

export function relativePhase74DatasetPath(
  outputRoot: string,
  dataFile: string,
): string {
  const relativePath = relative(resolve(outputRoot), resolve(dataFile));
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Phase 74 dataset file must remain inside the output root.");
  }
  return relativePath;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Phase 74 dataset source ${url}: ${response.status} ${response.statusText}.`,
    );
  }
  return response.text();
}

export async function preparePhase74FrozenDataset(
  options: Phase74DatasetPrepOptions,
  dependencies: Phase74DatasetPrepDependencies = {},
): Promise<{ bundle: Phase74DatasetBundle; dataFile: string }> {
  const source = PHASE74_FROZEN_DATASET_SOURCES[options.benchmark];
  const raw = options.sourceFile === undefined
    ? await (dependencies.fetchText ?? fetchText)(source.sourceUrl)
    : await (dependencies.readFile ?? ((path) => readFile(path, "utf8")))(
        options.sourceFile,
      );
  verifyPhase74DatasetSource({ raw, source });

  let bundle: Phase74DatasetBundle;
  let dataFile: string;
  let datasetContent: string;
  if (options.benchmark === "longmemeval") {
    bundle = createPhase74LongMemEvalDataset({ raw });
    dataFile = join(options.outputRoot, "longmemeval_s_cleaned.json");
    datasetContent = raw;
  } else {
    const cases = normalizePhase74LocomoSource(raw);
    datasetContent = `${JSON.stringify({ cases }, null, 2)}\n`;
    bundle = createPhase74LocomoDataset({ normalizedRaw: datasetContent });
    dataFile = join(options.outputRoot, "cases.json");
  }
  assertPhase74FrozenDataset(bundle);

  const mkdirImpl = dependencies.mkdir ?? ((path: string) =>
    mkdir(path, { recursive: true }));
  const writeFileImpl = dependencies.writeFile ?? ((path, data) =>
    writeFile(path, data, "utf8"));
  await mkdirImpl(options.outputRoot);
  await writeFileImpl(dataFile, datasetContent);
  await writeFileImpl(
    join(options.outputRoot, "dataset-manifest.json"),
    `${JSON.stringify({
      ...bundle.manifest,
      dataFile: relativePhase74DatasetPath(options.outputRoot, dataFile),
      sourceByteSize: Buffer.byteLength(raw, "utf8"),
    }, null, 2)}\n`,
  );
  return { bundle, dataFile };
}

if (import.meta.main) {
  const result = await preparePhase74FrozenDataset(
    parsePhase74DatasetPrepOptions(Bun.argv),
  );
  console.log(JSON.stringify({
    benchmark: result.bundle.manifest.benchmark,
    caseCount: result.bundle.manifest.caseCount,
    dataFile: result.dataFile,
    datasetSha256: result.bundle.manifest.datasetSha256,
    normalizedFingerprint: result.bundle.manifest.normalizedFingerprint,
  }, null, 2));
}
