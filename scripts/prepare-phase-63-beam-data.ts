import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";

export type Phase63BeamDatasetSplit = "100K" | "500K" | "1M";

export interface Phase63BeamPrepareOptions {
  dataset: string;
  length: number;
  offset: number;
  outputRoot: string;
  split: Phase63BeamDatasetSplit;
}

export interface Phase63BeamPrepareResult {
  dataFile: string;
  dataset: string;
  generatedAt: string;
  metadataFile: string;
  outputRoot: string;
  rowCount: number;
  rowsEndpoint: string;
  split: Phase63BeamDatasetSplit;
  totalRows: number | null;
}

export interface Phase63BeamPrepareDependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  requestJson?: (url: string) => Promise<unknown>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

interface HuggingFaceRowsResponse {
  num_rows_total?: number;
  partial?: boolean;
  rows: HuggingFaceRowRecord[];
}

interface HuggingFaceRowRecord {
  row: unknown;
  row_idx: number;
  truncated_cells?: string[];
}

const DEFAULT_DATASET = "Mohammadta/BEAM";
const DEFAULT_LENGTH = 100;
const DEFAULT_OFFSET = 0;
const DEFAULT_OUTPUT_ROOT = "/private/tmp/BEAM";
const DEFAULT_SPLIT: Phase63BeamDatasetSplit = "100K";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: string | undefined, flagName: string): number {
  if (!value) {
    return flagName === "--length" ? DEFAULT_LENGTH : DEFAULT_OFFSET;
  }
  const parsed = Number(value);
  const valid =
    Number.isInteger(parsed) &&
    (flagName === "--offset" ? parsed >= 0 : parsed >= 1);
  if (!valid) {
    throw new Error(`${flagName} must be a ${flagName === "--offset" ? "non-negative" : "positive"} integer`);
  }
  return parsed;
}

function parseSplit(value: string | undefined): Phase63BeamDatasetSplit {
  if (!value) {
    return DEFAULT_SPLIT;
  }
  if (value === "100K" || value === "500K" || value === "1M") {
    return value;
  }
  throw new Error("--split must be 100K, 500K, or 1M");
}

export function parsePhase63BeamPrepareCliOptions(
  argv: readonly string[],
): Phase63BeamPrepareOptions {
  return {
    dataset: resolveCliFlagValue(argv, "--dataset") ?? DEFAULT_DATASET,
    length: parsePositiveInteger(resolveCliFlagValue(argv, "--length"), "--length"),
    offset: parsePositiveInteger(resolveCliFlagValue(argv, "--offset"), "--offset"),
    outputRoot:
      resolveCliFlagValue(argv, "--output-root") ??
      process.env.GOODMEMORY_BEAM_ROOT ??
      DEFAULT_OUTPUT_ROOT,
    split: parseSplit(resolveCliFlagValue(argv, "--split")),
  };
}

export function buildPhase63BeamRowsUrl(
  options: Pick<
    Phase63BeamPrepareOptions,
    "dataset" | "length" | "offset" | "split"
  >,
): string {
  const params = new URLSearchParams({
    dataset: options.dataset,
    config: "default",
    split: options.split,
    offset: String(options.offset),
    length: String(options.length),
  });
  return `https://datasets-server.huggingface.co/rows?${params.toString()}`;
}

async function requestJsonWithCurl(url: string): Promise<unknown> {
  const proc = Bun.spawn(["curl", "-sS", url], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`curl failed for BEAM rows endpoint: ${stderr.trim()}`);
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `BEAM rows endpoint did not return valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function readRowsResponse(value: unknown): HuggingFaceRowsResponse {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    throw new Error("BEAM rows response must include a rows array");
  }
  return {
    num_rows_total:
      typeof value.num_rows_total === "number" ? value.num_rows_total : undefined,
    partial: value.partial === true,
    rows: value.rows.map((entry) => {
      if (!isRecord(entry)) {
        throw new Error("BEAM rows response entries must be objects");
      }
      return {
        row: entry.row,
        row_idx: typeof entry.row_idx === "number" ? entry.row_idx : -1,
        truncated_cells: Array.isArray(entry.truncated_cells)
          ? entry.truncated_cells.filter(
              (cell): cell is string => typeof cell === "string",
            )
          : [],
      };
    }),
  };
}

function normalizeBeamRowsResponse(response: HuggingFaceRowsResponse): unknown[] {
  if (response.partial) {
    throw new Error("BEAM rows response is partial; refusing incomplete export");
  }
  const truncated = response.rows.filter(
    (entry) => (entry.truncated_cells ?? []).length > 0,
  );
  if (truncated.length > 0) {
    const detail = truncated
      .map(
        (entry) =>
          `row ${entry.row_idx}: ${(entry.truncated_cells ?? []).join(", ")}`,
      )
      .join("; ");
    throw new Error(`BEAM rows response contains truncated cells: ${detail}`);
  }
  return response.rows.map((entry) => entry.row);
}

export async function preparePhase63BeamData(
  options: Phase63BeamPrepareOptions,
  dependencies: Phase63BeamPrepareDependencies = {},
): Promise<Phase63BeamPrepareResult> {
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const requestJson = dependencies.requestJson ?? requestJsonWithCurl;
  const now = dependencies.now ?? (() => new Date());
  const rowsEndpoint = buildPhase63BeamRowsUrl(options);
  const response = readRowsResponse(await requestJson(rowsEndpoint));
  const rows = normalizeBeamRowsResponse(response);
  const generatedAt = now().toISOString();
  const dataFile = join(options.outputRoot, `${options.split}.json`);
  const metadataFile = join(options.outputRoot, "phase-63-beam-export-metadata.json");
  const result: Phase63BeamPrepareResult = {
    dataFile,
    dataset: options.dataset,
    generatedAt,
    metadataFile,
    outputRoot: options.outputRoot,
    rowCount: rows.length,
    rowsEndpoint,
    split: options.split,
    totalRows: response.num_rows_total ?? null,
  };

  await mkdirImpl(options.outputRoot, { recursive: true });
  await writeFileImpl(dataFile, `${JSON.stringify(rows, null, 2)}\n`);
  await writeFileImpl(metadataFile, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.main) {
  const result = await preparePhase63BeamData(
    parsePhase63BeamPrepareCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(result, null, 2));
}
