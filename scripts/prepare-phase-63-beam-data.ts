import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";

export type Phase63BeamDatasetSplit = "100K" | "500K" | "1M";
export type Phase63BeamPrepareSource = "huggingface" | "github-raw";

export interface Phase63BeamPrepareOptions {
  dataset: string;
  githubApiRoot?: string;
  githubConcurrency?: number;
  githubRawRoot?: string;
  length: number;
  offset: number;
  outputRoot: string;
  source?: Phase63BeamPrepareSource;
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
  source: Phase63BeamPrepareSource;
  split: Phase63BeamDatasetSplit;
  totalRows: number | null;
}

export interface Phase63BeamPrepareDependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  requestJson?: (url: string) => Promise<unknown>;
  requestText?: (url: string) => Promise<string>;
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

interface GithubContentsEntry {
  name: string;
  type: string;
}

const DEFAULT_DATASET = "Mohammadta/BEAM";
const DEFAULT_GITHUB_API_ROOT =
  "https://api.github.com/repos/mohammadtavakoli78/BEAM/contents/chats";
const DEFAULT_GITHUB_RAW_ROOT =
  "https://raw.githubusercontent.com/mohammadtavakoli78/BEAM/main/chats";
const DEFAULT_LENGTH = 100;
const DEFAULT_OFFSET = 0;
const DEFAULT_OUTPUT_ROOT = "/private/tmp/BEAM";
const DEFAULT_SOURCE: Phase63BeamPrepareSource = "huggingface";
const DEFAULT_SPLIT: Phase63BeamDatasetSplit = "100K";
const DEFAULT_GITHUB_CONCURRENCY = 6;

const GITHUB_RAW_JSON_FILES = {
  chat: "chat.json",
  probingQuestions: "probing_questions/probing_questions.json",
  topic: "topic.json",
  userMessages: "user_messages.json",
} as const;

const GITHUB_RAW_TEXT_FILES = {
  labels: "labels.txt",
  mainSpec: "main_spec.txt",
  plan: "plan_new.txt",
  relationships: "relationships.txt",
} as const;

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

function parseOptionalPositiveInteger(
  value: string | undefined,
  flagName: string,
): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer`);
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

function parseSource(value: string | undefined): Phase63BeamPrepareSource | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "huggingface" || value === "github-raw") {
    return value;
  }
  throw new Error("--source must be huggingface or github-raw");
}

export function parsePhase63BeamPrepareCliOptions(
  argv: readonly string[],
): Phase63BeamPrepareOptions {
  const githubApiRoot = resolveCliFlagValue(argv, "--github-api-root");
  const githubConcurrency = parseOptionalPositiveInteger(
    resolveCliFlagValue(argv, "--github-concurrency"),
    "--github-concurrency",
  );
  const githubRawRoot = resolveCliFlagValue(argv, "--github-raw-root");
  const source = parseSource(resolveCliFlagValue(argv, "--source"));
  return {
    dataset: resolveCliFlagValue(argv, "--dataset") ?? DEFAULT_DATASET,
    ...(githubApiRoot ? { githubApiRoot } : {}),
    ...(githubConcurrency ? { githubConcurrency } : {}),
    ...(githubRawRoot ? { githubRawRoot } : {}),
    length: parsePositiveInteger(resolveCliFlagValue(argv, "--length"), "--length"),
    offset: parsePositiveInteger(resolveCliFlagValue(argv, "--offset"), "--offset"),
    outputRoot:
      resolveCliFlagValue(argv, "--output-root") ??
      process.env.GOODMEMORY_BEAM_ROOT ??
      DEFAULT_OUTPUT_ROOT,
    ...(source ? { source } : {}),
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

export function buildPhase63BeamGithubIndexUrl(
  options: Pick<Phase63BeamPrepareOptions, "githubApiRoot" | "split">,
): string {
  return `${trimTrailingSlash(options.githubApiRoot ?? DEFAULT_GITHUB_API_ROOT)}/${options.split}`;
}

function buildPhase63BeamGithubRawFileUrl(input: {
  conversationId: string;
  fileName: string;
  githubRawRoot?: string;
  split: Phase63BeamDatasetSplit;
}): string {
  const root = trimTrailingSlash(input.githubRawRoot ?? DEFAULT_GITHUB_RAW_ROOT);
  return `${root}/${input.split}/${input.conversationId}/${input.fileName}`;
}

export function buildPhase63BeamCurlRequestCommand(url: string): string[] {
  return [
    "curl",
    "-sS",
    "-L",
    "--retry",
    "4",
    "--retry-delay",
    "1",
    "--retry-all-errors",
    "--connect-timeout",
    "20",
    "--max-time",
    "120",
    url,
  ];
}

async function requestJsonWithCurl(url: string): Promise<unknown> {
  const proc = Bun.spawn(buildPhase63BeamCurlRequestCommand(url), {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`curl failed for BEAM request: ${stderr.trim()}`);
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `BEAM request did not return valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function requestTextWithCurl(url: string): Promise<string> {
  const proc = Bun.spawn(buildPhase63BeamCurlRequestCommand(url), {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`curl failed for BEAM request: ${stderr.trim()}`);
  }
  return stdout;
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

function readGithubContentsEntries(value: unknown): GithubContentsEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("BEAM GitHub contents response must be an array");
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("BEAM GitHub contents entries must be objects");
    }
    const name = entry.name;
    const type = entry.type;
    if (typeof name !== "string" || typeof type !== "string") {
      throw new Error("BEAM GitHub contents entries must include name and type");
    }
    return { name, type };
  });
}

function selectGithubConversationIds(
  entries: readonly GithubContentsEntry[],
  options: Pick<Phase63BeamPrepareOptions, "length" | "offset">,
): string[] {
  return entries
    .filter((entry) => entry.type === "dir" && /^\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left) - Number(right))
    .slice(options.offset, options.offset + options.length);
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  limit: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!);
      }
    }),
  );
  return results;
}

function readGithubChat(value: unknown, conversationId: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`BEAM GitHub chat ${conversationId} must be an array`);
  }
  return value.flatMap((batch) => {
    if (!isRecord(batch) || !Array.isArray(batch.turns)) {
      throw new Error(
        `BEAM GitHub chat ${conversationId} batches must include turns arrays`,
      );
    }
    return batch.turns.map((turnGroup) => {
      if (!Array.isArray(turnGroup)) {
        throw new Error(
          `BEAM GitHub chat ${conversationId} turn groups must be arrays`,
        );
      }
      return turnGroup;
    });
  });
}

function readGithubUserQuestions(value: unknown, conversationId: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`BEAM GitHub user_messages ${conversationId} must be an array`);
  }
  return value.map((batch) => {
    if (!isRecord(batch) || !Array.isArray(batch.messages)) {
      throw new Error(
        `BEAM GitHub user_messages ${conversationId} batches must include messages arrays`,
      );
    }
    const timeAnchor = batch.time_anchor;
    if (typeof timeAnchor !== "string" || timeAnchor.length === 0) {
      throw new Error(
        `BEAM GitHub user_messages ${conversationId} entries must include time_anchor`,
      );
    }
    return {
      messages: batch.messages.map((message) => {
        if (!isRecord(message) || typeof message.content !== "string") {
          throw new Error(
            `BEAM GitHub user_messages ${conversationId} messages must include content`,
          );
        }
        return [message.content];
      }),
      time_anchor: timeAnchor,
    };
  });
}

async function readGithubJsonFile(input: {
  conversationId: string;
  fileName: string;
  options: Phase63BeamPrepareOptions;
  requestJson: (url: string) => Promise<unknown>;
}): Promise<unknown> {
  return input.requestJson(
    buildPhase63BeamGithubRawFileUrl({
      conversationId: input.conversationId,
      fileName: input.fileName,
      githubRawRoot: input.options.githubRawRoot,
      split: input.options.split,
    }),
  );
}

async function readGithubTextFile(input: {
  conversationId: string;
  fileName: string;
  options: Phase63BeamPrepareOptions;
  requestText: (url: string) => Promise<string>;
}): Promise<string> {
  return input.requestText(
    buildPhase63BeamGithubRawFileUrl({
      conversationId: input.conversationId,
      fileName: input.fileName,
      githubRawRoot: input.options.githubRawRoot,
      split: input.options.split,
    }),
  );
}

async function readGithubRawRow(input: {
  conversationId: string;
  options: Phase63BeamPrepareOptions;
  requestJson: (url: string) => Promise<unknown>;
  requestText: (url: string) => Promise<string>;
}): Promise<Record<string, unknown>> {
  const [chat, topic, probingQuestions, userMessages] = await Promise.all([
    readGithubJsonFile({
      conversationId: input.conversationId,
      fileName: GITHUB_RAW_JSON_FILES.chat,
      options: input.options,
      requestJson: input.requestJson,
    }),
    readGithubJsonFile({
      conversationId: input.conversationId,
      fileName: GITHUB_RAW_JSON_FILES.topic,
      options: input.options,
      requestJson: input.requestJson,
    }),
    readGithubJsonFile({
      conversationId: input.conversationId,
      fileName: GITHUB_RAW_JSON_FILES.probingQuestions,
      options: input.options,
      requestJson: input.requestJson,
    }),
    readGithubJsonFile({
      conversationId: input.conversationId,
      fileName: GITHUB_RAW_JSON_FILES.userMessages,
      options: input.options,
      requestJson: input.requestJson,
    }),
  ]);
  const [conversationPlan, narratives, userInfo, userRelationships] =
    await Promise.all([
      readGithubTextFile({
        conversationId: input.conversationId,
        fileName: GITHUB_RAW_TEXT_FILES.plan,
        options: input.options,
        requestText: input.requestText,
      }),
      readGithubTextFile({
        conversationId: input.conversationId,
        fileName: GITHUB_RAW_TEXT_FILES.labels,
        options: input.options,
        requestText: input.requestText,
      }),
      readGithubTextFile({
        conversationId: input.conversationId,
        fileName: GITHUB_RAW_TEXT_FILES.mainSpec,
        options: input.options,
        requestText: input.requestText,
      }),
      readGithubTextFile({
        conversationId: input.conversationId,
        fileName: GITHUB_RAW_TEXT_FILES.relationships,
        options: input.options,
        requestText: input.requestText,
      }),
    ]);

  return {
    chat: readGithubChat(chat, input.conversationId),
    conversation_id: input.conversationId,
    conversation_plan: conversationPlan,
    conversation_seed: topic,
    narratives,
    probing_questions: probingQuestions,
    user_profile: {
      user_info: userInfo,
      user_relationships: userRelationships,
    },
    user_questions: readGithubUserQuestions(userMessages, input.conversationId),
  };
}

async function prepareHuggingFaceRows(input: {
  options: Phase63BeamPrepareOptions;
  requestJson: (url: string) => Promise<unknown>;
}): Promise<{
  rows: unknown[];
  rowsEndpoint: string;
  totalRows: number | null;
}> {
  const rowsEndpoint = buildPhase63BeamRowsUrl(input.options);
  const response = readRowsResponse(await input.requestJson(rowsEndpoint));
  return {
    rows: normalizeBeamRowsResponse(response),
    rowsEndpoint,
    totalRows: response.num_rows_total ?? null,
  };
}

async function prepareGithubRawRows(input: {
  options: Phase63BeamPrepareOptions;
  requestJson: (url: string) => Promise<unknown>;
  requestText: (url: string) => Promise<string>;
}): Promise<{
  rows: unknown[];
  rowsEndpoint: string;
  totalRows: number | null;
}> {
  const rowsEndpoint = buildPhase63BeamGithubIndexUrl(input.options);
  const entries = readGithubContentsEntries(await input.requestJson(rowsEndpoint));
  const conversationIds = selectGithubConversationIds(entries, input.options);
  const githubConcurrency =
    input.options.githubConcurrency ?? DEFAULT_GITHUB_CONCURRENCY;
  const rows = await mapWithConcurrency(
    conversationIds,
    githubConcurrency,
    (conversationId) =>
      readGithubRawRow({
        conversationId,
        options: input.options,
        requestJson: input.requestJson,
        requestText: input.requestText,
      }),
  );
  const totalRows = entries.filter(
    (entry) => entry.type === "dir" && /^\d+$/u.test(entry.name),
  ).length;
  return { rows, rowsEndpoint, totalRows };
}

export async function preparePhase63BeamData(
  options: Phase63BeamPrepareOptions,
  dependencies: Phase63BeamPrepareDependencies = {},
): Promise<Phase63BeamPrepareResult> {
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const requestJson = dependencies.requestJson ?? requestJsonWithCurl;
  const requestText = dependencies.requestText ?? requestTextWithCurl;
  const now = dependencies.now ?? (() => new Date());
  const source = options.source ?? DEFAULT_SOURCE;
  const prepared =
    source === "github-raw"
      ? await prepareGithubRawRows({ options, requestJson, requestText })
      : await prepareHuggingFaceRows({ options, requestJson });
  const generatedAt = now().toISOString();
  const dataFile = join(options.outputRoot, `${options.split}.json`);
  const metadataFile = join(options.outputRoot, "phase-63-beam-export-metadata.json");
  const result: Phase63BeamPrepareResult = {
    dataFile,
    dataset: options.dataset,
    generatedAt,
    metadataFile,
    outputRoot: options.outputRoot,
    rowCount: prepared.rows.length,
    rowsEndpoint: prepared.rowsEndpoint,
    source,
    split: options.split,
    totalRows: prepared.totalRows,
  };

  await mkdirImpl(options.outputRoot, { recursive: true });
  await writeFileImpl(dataFile, `${JSON.stringify(prepared.rows, null, 2)}\n`);
  await writeFileImpl(metadataFile, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.main) {
  const result = await preparePhase63BeamData(
    parsePhase63BeamPrepareCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(result, null, 2));
}
