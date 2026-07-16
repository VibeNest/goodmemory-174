import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { z } from "zod";

import {
  parseCodexCodingEffectDataset,
} from "./dataset";
import type {
  CodexCodingEffectDatasetV2,
} from "./dataset";
import { validateC4ControlledPilotDataset } from "./c4-contracts";
import { c4HiddenValueAppearsInSurface } from "./c4-leakage";
import { runBoundaryProcess } from "./process";

const DATASET_ID = "codex-c4-controlled-pilot-v1";
const FIXED_GIT_DATE = "2026-07-15T18:00:00+00:00";
const OWNERSHIP_MARKER = ".goodmemory-c4-controlled-dataset-owned";
const DATASET_AUTHOR = "GoodMemory C4 dataset author";
const DATASET_AUTHOR_TASK_NAME = "/root";
const MIT_LICENSE = [
  "MIT License",
  "",
  "Copyright (c) 2026 GoodMemory contributors",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  "of this software and associated documentation files (the \"Software\"), to deal",
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
  "",
].join("\n");

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const assetFileSchema = z.object({
  bytes: z.number().int().nonnegative(),
  kind: z.enum([
    "author-attestation",
    "dataset-license",
    "evaluator",
    "gold-patch",
    "license-receipt",
    "manifest",
    "prehistory",
    "prompt",
    "repository-source",
  ]),
  path: z.string().min(1),
  sha256: sha256Schema,
}).strict();
const assetLockSchema = z.object({
  assetRootSha256: sha256Schema,
  files: z.array(assetFileSchema).min(1),
  schemaVersion: z.literal(1),
}).strict();

export type C4AssetFile = z.infer<typeof assetFileSchema>;
export type C4AssetLock = z.infer<typeof assetLockSchema>;

export interface C4ControlledPilotDatasetFixture {
  assetLock: C4AssetLock;
  assetLockSha256: string;
  dataset: CodexCodingEffectDatasetV2;
  root: string;
}

interface JsonCase {
  args: unknown[];
  expected: unknown;
}

interface TaskSpec {
  allowedFeedback: string;
  baseImplementation: string;
  failToPass: readonly JsonCase[];
  forbiddenStrings: readonly string[];
  functionName: string;
  goldImplementation: string;
  id: string;
  passToPass: readonly JsonCase[];
  prompt: string;
  visible: readonly JsonCase[];
}

interface EpisodeSpec {
  history: readonly { role: "assistant" | "user"; text: string }[];
  id: string;
  memoryMode: "irrelevant-control" | "required";
  repositoryId: RepositorySpec["id"];
  stages: readonly [TaskSpec, TaskSpec, TaskSpec];
  strata: readonly MemoryStratum[];
}

interface RepositorySpec {
  id: "continuity-utils" | "policy-utils";
  preamble: string;
  title: string;
  url: string;
}

export type C4ControlledRepositoryId = RepositorySpec["id"];

type MemoryStratum = CodexCodingEffectDatasetV2["episodes"][number]["strata"][number];

const REPOSITORIES: readonly RepositorySpec[] = [
  {
    id: "continuity-utils",
    preamble: "",
    title: "Continuity Utils",
    url: "https://example.invalid/goodmemory-c4/continuity-utils.git",
  },
  {
    id: "policy-utils",
    preamble: [
      "export type ParseResult<T> =",
      "  | { ok: true; value: T }",
      "  | { error: string; ok: false };",
      "",
      'export type TransportMode = "direct" | "relay";',
      "",
      "export const SETTING_ERROR_CODES = {",
      '  boolean: "invalid-boolean",',
      '  integer: "invalid-integer",',
      '  mode: "invalid-mode",',
      "} as const;",
      "",
    ].join("\n"),
    title: "Policy Utils",
    url: "https://example.invalid/goodmemory-c4/policy-utils.git",
  },
] as const;

const EPISODES: readonly EpisodeSpec[] = [
  {
    history: [
      {
        role: "user",
        text: "Continue the endpoint parser cleanup in the next session. The remaining work is boundary normalization, strict port syntax, and IPv6-safe rendering; preserve the existing public signatures.",
      },
      {
        role: "assistant",
        text: "Recorded the open endpoint-parser follow-up and the requirement to keep the public surface stable.",
      },
    ],
    id: "endpoint-open-loop",
    memoryMode: "required",
    repositoryId: "continuity-utils",
    stages: [
      task({
        allowedFeedback: "The endpoint cleanup remains open; normalize only the host boundary without broadening the API.",
        baseImplementation: [
          "export function normalizeHost(value: string): string {",
          "  return value;",
          "}",
        ],
        failToPass: [{ args: [" \tapi.internal\n"], expected: "api.internal" }],
        forbiddenStrings: ["return value.trim();"],
        functionName: "normalizeHost",
        goldImplementation: [
          "export function normalizeHost(value: string): string {",
          "  return value.trim();",
          "}",
        ],
        id: "normalize-host-boundary",
        passToPass: [{ args: ["localhost"], expected: "localhost" }],
        prompt: "Finish normalizeHost so surrounding input whitespace is normalized while its signature and already-valid host behavior stay unchanged.",
        visible: [{ args: ["api.internal"], expected: "api.internal" }],
      }),
      task({
        allowedFeedback: "Keep the port grammar strict; numeric coercion previously accepted syntax outside the configuration contract.",
        baseImplementation: [
          "export function parsePort(value: string): number | null {",
          "  const parsed = Number(value);",
          "  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535",
          "    ? parsed",
          "    : null;",
          "}",
        ],
        failToPass: [
          { args: ["+443"], expected: null },
          { args: [" 443"], expected: null },
        ],
        forbiddenStrings: ["if (!/^[1-9][0-9]*$/u.test(value))"],
        functionName: "parsePort",
        goldImplementation: [
          "export function parsePort(value: string): number | null {",
          "  if (!/^[1-9][0-9]*$/u.test(value)) {",
          "    return null;",
          "  }",
          "  const parsed = Number(value);",
          "  return parsed <= 65_535 ? parsed : null;",
          "}",
        ],
        id: "parse-strict-port",
        passToPass: [
          { args: ["443"], expected: 443 },
          { args: ["0"], expected: null },
        ],
        prompt: "Complete parsePort with the repository's strict decimal port grammar. Preserve the number-or-null API and reject malformed or out-of-range input.",
        visible: [{ args: ["8080"], expected: 8080 }],
      }),
      task({
        allowedFeedback: "The last endpoint task is rendering: preserve hostname output and make literal IPv6 hosts unambiguous.",
        baseImplementation: [
          "export function formatEndpoint(host: string, port: number): string {",
          "  return `${host}:${port}`;",
          "}",
        ],
        failToPass: [{
          args: ["2001:db8::1", 443],
          expected: "[2001:db8::1]:443",
        }],
        forbiddenStrings: [
          'host.includes(":") && !host.startsWith("[")',
        ],
        functionName: "formatEndpoint",
        goldImplementation: [
          "export function formatEndpoint(host: string, port: number): string {",
          "  const renderedHost = host.includes(\":\") && !host.startsWith(\"[\")",
          "    ? `[${host}]`",
          "    : host;",
          "  return `${renderedHost}:${port}`;",
          "}",
        ],
        id: "format-ipv6-endpoint",
        passToPass: [{
          args: ["api.internal", 443],
          expected: "api.internal:443",
        }],
        prompt: "Make formatEndpoint render literal IPv6 hosts unambiguously without changing hostname output or the public function signature.",
        visible: [{ args: ["localhost", 3000], expected: "localhost:3000" }],
      }),
    ],
    strata: ["open-loop-handoff", "no-history-negative-control"],
  },
  {
    history: [
      {
        role: "user",
        text: "The first-delimiter implementation pattern was validated on the assignment parser: locate the delimiter once and preserve the complete tail. Reuse that approach for the related parsers.",
      },
      {
        role: "assistant",
        text: "Recorded the validated first-delimiter pattern and the requirement to preserve the tail exactly.",
      },
    ],
    id: "validated-first-delimiter",
    memoryMode: "required",
    repositoryId: "continuity-utils",
    stages: [
      delimiterTask("splitAssignment", "=", "assignment", "token=a=b", ["token", "a=b"]),
      delimiterTask("splitHeader", ":", "header", "x-trace:a:b", ["x-trace", "a:b"]),
      delimiterTask("splitRoute", "->", "route", "api->worker->store", ["api", "worker->store"]),
    ],
    strata: ["validated-approach"],
  },
  {
    history: [
      {
        role: "user",
        text: "Do not repeat the naive split shortcut in the remaining text parsers. It already failed when delimiters appeared inside quoted content; preserve quoted fields and only treat unquoted delimiters as structural.",
      },
      {
        role: "assistant",
        text: "Recorded the failed shortcut and the quote-aware parser boundary for the follow-up stages.",
      },
    ],
    id: "avoid-naive-split",
    memoryMode: "required",
    repositoryId: "continuity-utils",
    stages: [
      task({
        allowedFeedback: "The earlier split-at-hash shortcut is invalid when the marker occurs inside a quoted value.",
        baseImplementation: [
          "export function stripConfigComment(input: string): string {",
          '  return input.split("#")[0]!.trimEnd();',
          "}",
        ],
        failToPass: [{
          args: ['name="blue#green" # note'],
          expected: 'name="blue#green"',
        }],
        forbiddenStrings: ["let quote: string | null = null;"],
        functionName: "stripConfigComment",
        goldImplementation: quoteAwareCommentImplementation(),
        id: "strip-quoted-comment",
        passToPass: [{ args: ["name=blue # note"], expected: "name=blue" }],
        prompt: "Repair stripConfigComment so comment markers inside quoted values remain data while unquoted trailing comments are removed.",
        visible: [{ args: ["mode=fast # local"], expected: "mode=fast" }],
      }),
      task({
        allowedFeedback: "Whitespace splitting was also disproved for quoted command arguments; keep quoted spans together.",
        baseImplementation: [
          "export function tokenizeCommand(input: string): string[] {",
          "  return input.trim().split(/\\s+/u);",
          "}",
        ],
        failToPass: [{
          args: ['deploy --label "blue green"'],
          expected: ["deploy", "--label", "blue green"],
        }],
        forbiddenStrings: ["const tokens: string[] = [];"],
        functionName: "tokenizeCommand",
        goldImplementation: tokenizeCommandImplementation(),
        id: "tokenize-quoted-command",
        passToPass: [{
          args: ["deploy --dry-run"],
          expected: ["deploy", "--dry-run"],
        }],
        prompt: "Update tokenizeCommand to preserve quoted arguments while retaining the existing whitespace-separated behavior for ordinary commands.",
        visible: [{ args: ["build --clean"], expected: ["build", "--clean"] }],
      }),
      task({
        allowedFeedback: "The CSV follow-up has the same failure class: commas inside quoted fields are data, not separators.",
        baseImplementation: [
          "export function parseCsvFields(input: string): string[] {",
          '  return input.split(",").map((field) => field.trim());',
          "}",
        ],
        failToPass: [{
          args: ['alpha,"beta,gamma",delta'],
          expected: ["alpha", "beta,gamma", "delta"],
        }],
        forbiddenStrings: ["if (character === \",\" && !quoted)"],
        functionName: "parseCsvFields",
        goldImplementation: csvFieldsImplementation(),
        id: "parse-quoted-csv",
        passToPass: [{
          args: ["alpha,beta"],
          expected: ["alpha", "beta"],
        }],
        prompt: "Make parseCsvFields treat commas inside double-quoted fields as data and preserve current trimming for ordinary fields.",
        visible: [{ args: ["a, b"], expected: ["a", "b"] }],
      }),
    ],
    strata: ["failure-avoidance"],
  },
  {
    history: [
      {
        role: "user",
        text: "Correction: configuration parsers must never throw or silently invent a value. Follow the repository convention by returning the ParseResult discriminated union with stable error codes for invalid input.",
      },
      {
        role: "assistant",
        text: "Recorded the user correction and the ParseResult project convention for all remaining setting parsers.",
      },
    ],
    id: "parse-result-correction",
    memoryMode: "required",
    repositoryId: "policy-utils",
    stages: [
      task({
        allowedFeedback: "Invalid boolean text must use the ParseResult error branch instead of being coerced to false.",
        baseImplementation: [
          "export function parseBooleanSetting(input: string): ParseResult<boolean> {",
          '  return { ok: true, value: input === "true" };',
          "}",
        ],
        failToPass: [{
          args: ["yes"],
          expected: { error: "invalid-boolean", ok: false },
        }],
        forbiddenStrings: [
          "return { error: SETTING_ERROR_CODES.boolean, ok: false };",
        ],
        functionName: "parseBooleanSetting",
        goldImplementation: [
          "export function parseBooleanSetting(input: string): ParseResult<boolean> {",
          '  if (input === "true") {',
          "    return { ok: true, value: true };",
          "  }",
          '  if (input === "false") {',
          "    return { ok: true, value: false };",
          "  }",
          "  return { error: SETTING_ERROR_CODES.boolean, ok: false };",
          "}",
        ],
        id: "parse-boolean-result",
        passToPass: [
          { args: ["true"], expected: { ok: true, value: true } },
          { args: ["false"], expected: { ok: true, value: false } },
        ],
        prompt: "Bring parseBooleanSetting into the repository's ParseResult convention while preserving valid true and false behavior.",
        visible: [{ args: ["true"], expected: { ok: true, value: true } }],
      }),
      task({
        allowedFeedback: "The integer parser must reject non-integer syntax through the same stable result contract.",
        baseImplementation: [
          "export function parseIntegerSetting(input: string): ParseResult<number> {",
          "  return { ok: true, value: Number(input) };",
          "}",
        ],
        failToPass: [
          { args: ["4.2"], expected: { error: "invalid-integer", ok: false } },
          { args: ["12x"], expected: { error: "invalid-integer", ok: false } },
        ],
        forbiddenStrings: ["error: SETTING_ERROR_CODES.integer"],
        functionName: "parseIntegerSetting",
        goldImplementation: [
          "export function parseIntegerSetting(input: string): ParseResult<number> {",
          "  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(input)) {",
          "    return { error: SETTING_ERROR_CODES.integer, ok: false };",
          "  }",
          "  const value = Number(input);",
          "  return Number.isSafeInteger(value)",
          "    ? { ok: true, value }",
          "    : { error: SETTING_ERROR_CODES.integer, ok: false };",
          "}",
        ],
        id: "parse-integer-result",
        passToPass: [{ args: ["12"], expected: { ok: true, value: 12 } }],
        prompt: "Make parseIntegerSetting reject invalid integer syntax through ParseResult without changing valid signed-integer output.",
        visible: [{ args: ["-7"], expected: { ok: true, value: -7 } }],
      }),
      task({
        allowedFeedback: "The transport mode parser must use the shared invalid-mode error branch, not an unchecked cast.",
        baseImplementation: [
          "export function parseModeSetting(input: string): ParseResult<TransportMode> {",
          "  return { ok: true, value: input as TransportMode };",
          "}",
        ],
        failToPass: [{
          args: ["turbo"],
          expected: { error: "invalid-mode", ok: false },
        }],
        forbiddenStrings: [
          "return { error: SETTING_ERROR_CODES.mode, ok: false };",
        ],
        functionName: "parseModeSetting",
        goldImplementation: [
          "export function parseModeSetting(input: string): ParseResult<TransportMode> {",
          '  if (input === "direct" || input === "relay") {',
          "    return { ok: true, value: input };",
          "  }",
          "  return { error: SETTING_ERROR_CODES.mode, ok: false };",
          "}",
        ],
        id: "parse-mode-result",
        passToPass: [{
          args: ["direct"],
          expected: { ok: true, value: "direct" },
        }],
        prompt: "Apply the shared ParseResult validation convention to parseModeSetting and preserve both supported transport modes.",
        visible: [{
          args: ["relay"],
          expected: { ok: true, value: "relay" },
        }],
      }),
    ],
    strata: ["user-correction", "project-convention"],
  },
  {
    history: [
      {
        role: "user",
        text: "The configuration contract changed: timeout and delay fields are now expressed in seconds, superseding the old millisecond-input assumption. Public runtime values remain milliseconds.",
      },
      {
        role: "assistant",
        text: "Recorded the newer seconds-at-config-boundary rule and that runtime outputs remain milliseconds.",
      },
    ],
    id: "stale-time-unit-update",
    memoryMode: "required",
    repositoryId: "policy-utils",
    stages: [
      task({
        allowedFeedback: "Use the newer seconds input contract; the returned timeout remains milliseconds.",
        baseImplementation: [
          "export function timeoutToMs(seconds: number): number {",
          "  return seconds;",
          "}",
        ],
        failToPass: [{ args: [2.5], expected: 2500 }],
        forbiddenStrings: ["return seconds * 1_000;"],
        functionName: "timeoutToMs",
        goldImplementation: [
          "export function timeoutToMs(seconds: number): number {",
          "  return seconds * 1_000;",
          "}",
        ],
        id: "convert-timeout-seconds",
        passToPass: [{ args: [0], expected: 0 }],
        prompt: "Update timeoutToMs for the current configuration-unit contract while preserving its millisecond runtime output.",
        visible: [{ args: [0], expected: 0 }],
      }),
      task({
        allowedFeedback: "Both schedule fields cross the same seconds-to-milliseconds boundary.",
        baseImplementation: [
          "export function scheduleToMs(input: { initialSeconds: number; maxSeconds: number }): { initialMs: number; maxMs: number } {",
          "  return { initialMs: input.initialSeconds, maxMs: input.maxSeconds };",
          "}",
        ],
        failToPass: [{
          args: [{ initialSeconds: 1, maxSeconds: 8 }],
          expected: { initialMs: 1000, maxMs: 8000 },
        }],
        forbiddenStrings: ["initialMs: input.initialSeconds * 1_000"],
        functionName: "scheduleToMs",
        goldImplementation: [
          "export function scheduleToMs(input: { initialSeconds: number; maxSeconds: number }): { initialMs: number; maxMs: number } {",
          "  return {",
          "    initialMs: input.initialSeconds * 1_000,",
          "    maxMs: input.maxSeconds * 1_000,",
          "  };",
          "}",
        ],
        id: "convert-schedule-seconds",
        passToPass: [{
          args: [{ initialSeconds: 0, maxSeconds: 0 }],
          expected: { initialMs: 0, maxMs: 0 },
        }],
        prompt: "Apply the current configuration-unit contract to both fields returned by scheduleToMs without changing its object shape.",
        visible: [{
          args: [{ initialSeconds: 0, maxSeconds: 0 }],
          expected: { initialMs: 0, maxMs: 0 },
        }],
      }),
      task({
        allowedFeedback: "Deadline arithmetic also receives a timeout in configuration seconds and returns an epoch in milliseconds.",
        baseImplementation: [
          "export function deadlineFromConfig(startMs: number, timeoutSeconds: number): number {",
          "  return startMs + timeoutSeconds;",
          "}",
        ],
        failToPass: [{ args: [1000, 2], expected: 3000 }],
        forbiddenStrings: ["timeoutSeconds * 1_000"],
        functionName: "deadlineFromConfig",
        goldImplementation: [
          "export function deadlineFromConfig(startMs: number, timeoutSeconds: number): number {",
          "  return startMs + timeoutSeconds * 1_000;",
          "}",
        ],
        id: "compute-deadline-seconds",
        passToPass: [{ args: [1000, 0], expected: 1000 }],
        prompt: "Correct deadlineFromConfig for the current timeout input unit while keeping the returned epoch in milliseconds.",
        visible: [{ args: [5000, 0], expected: 5000 }],
      }),
    ],
    strata: ["stale-update"],
  },
  {
    history: [
      {
        role: "user",
        text: "For the documentation site, keep the ocean-blue accent and use sentence case in navigation labels. The illustration export is tracked separately.",
      },
      {
        role: "assistant",
        text: "Recorded the documentation visual convention and illustration follow-up.",
      },
    ],
    id: "irrelevant-history-control",
    memoryMode: "irrelevant-control",
    repositoryId: "policy-utils",
    stages: [
      task({
        allowedFeedback: "The prior documentation styling discussion is unrelated to this utility task.",
        baseImplementation: [
          "export function slugify(value: string): string {",
          '  return value.toLowerCase().replace(" ", "-");',
          "}",
        ],
        failToPass: [{ args: ["  Blue__Green  "], expected: "blue-green" }],
        forbiddenStrings: ["replace(/[^a-z0-9]+/gu, \"-\")"],
        functionName: "slugify",
        goldImplementation: [
          "export function slugify(value: string): string {",
          "  return value",
          "    .trim()",
          "    .toLowerCase()",
          '    .replace(/[^a-z0-9]+/gu, "-")',
          '    .replace(/^-|-$/gu, "");',
          "}",
        ],
        id: "normalize-slug",
        passToPass: [{ args: ["Hello World"], expected: "hello-world" }],
        prompt: "Harden slugify for repeated separators and boundary punctuation while preserving its lowercase hyphenated output.",
        visible: [{ args: ["Hello World"], expected: "hello-world" }],
      }),
      task({
        allowedFeedback: "The remembered documentation preferences remain irrelevant; implement only the CSV utility contract.",
        baseImplementation: [
          "export function parseCsvUnique(input: string): string[] {",
          '  return input.split(",");',
          "}",
        ],
        failToPass: [{
          args: ["alpha, beta,alpha"],
          expected: ["alpha", "beta"],
        }],
        forbiddenStrings: ["return [...new Set(values)];"],
        functionName: "parseCsvUnique",
        goldImplementation: [
          "export function parseCsvUnique(input: string): string[] {",
          '  const values = input.split(",")',
          "    .map((value) => value.trim())",
          "    .filter((value) => value.length > 0);",
          "  return [...new Set(values)];",
          "}",
        ],
        id: "dedupe-csv-values",
        passToPass: [{
          args: ["alpha,beta"],
          expected: ["alpha", "beta"],
        }],
        prompt: "Make parseCsvUnique trim fields, ignore empty entries, and preserve first-seen order while removing duplicates.",
        visible: [{ args: ["a,b"], expected: ["a", "b"] }],
      }),
      task({
        allowedFeedback: "Ignore the unrelated visual-design memory and preserve the path-segment utility boundary.",
        baseImplementation: [
          "export function encodePathSegment(value: string): string {",
          "  return encodeURI(value);",
          "}",
        ],
        failToPass: [{
          args: ["docs/setup guide#intro"],
          expected: "docs%2Fsetup%20guide%23intro",
        }],
        forbiddenStrings: ["return encodeURIComponent(value);"],
        functionName: "encodePathSegment",
        goldImplementation: [
          "export function encodePathSegment(value: string): string {",
          "  return encodeURIComponent(value);",
          "}",
        ],
        id: "encode-path-segment",
        passToPass: [{ args: ["read me"], expected: "read%20me" }],
        prompt: "Correct encodePathSegment so reserved path syntax is encoded as data while ordinary segment encoding remains unchanged.",
        visible: [{ args: ["read me"], expected: "read%20me" }],
      }),
    ],
    strata: ["irrelevant-memory-negative-control"],
  },
] as const;

const fixtureOwnership = new WeakMap<C4ControlledPilotDatasetFixture, string>();

export async function prepareC4ControlledPilotDataset(input: {
  root: string;
}): Promise<C4ControlledPilotDatasetFixture> {
  const root = resolve(input.root);
  await assertAbsent(root, "C4 controlled dataset root");
  await mkdir(root, { recursive: true });
  const ownershipToken = randomUUID();
  await writeFile(join(root, OWNERSHIP_MARKER), `${ownershipToken}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  try {
    const buildRoot = join(root, ".materialize");
    await writeDatasetAssets(root);
    const repositoryIdentity = await buildRepositoriesAndGold(root, buildRoot);
    await rm(buildRoot, { recursive: true });
    const dataset = await writeManifest(root, repositoryIdentity);
    const assetLock = await buildC4AssetLock(root);
    const assetLockBytes = serializeC4AssetLock(assetLock);
    await writeFile(join(root, "asset-lock.json"), assetLockBytes, {
      encoding: "utf8",
      flag: "wx",
    });
    const fixture: C4ControlledPilotDatasetFixture = Object.freeze({
      assetLock,
      assetLockSha256: sha256(assetLockBytes),
      dataset,
      root,
    });
    fixtureOwnership.set(fixture, ownershipToken);
    return fixture;
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}

export async function cleanupC4ControlledPilotDataset(
  fixture: C4ControlledPilotDatasetFixture,
): Promise<void> {
  const ownershipToken = fixtureOwnership.get(fixture);
  if (ownershipToken === undefined) {
    throw new Error("C4 controlled dataset fixture has no ownership record");
  }
  if (!await pathExists(fixture.root)) {
    return;
  }
  const markerPath = join(fixture.root, OWNERSHIP_MARKER);
  const marker = await readFile(markerPath, "utf8");
  if (marker !== `${ownershipToken}\n`) {
    throw new Error("C4 controlled dataset ownership marker does not match");
  }
  await rm(fixture.root, { recursive: true });
}

export async function loadC4AssetLock(root: string): Promise<{
  assetLock: C4AssetLock;
  assetLockSha256: string;
}> {
  const bytes = await readFile(join(root, "asset-lock.json"), "utf8");
  const parsed = assetLockSchema.safeParse(JSON.parse(bytes) as unknown);
  if (!parsed.success) {
    throw new Error("invalid C4 asset lock");
  }
  return { assetLock: parsed.data, assetLockSha256: sha256(bytes) };
}

export async function buildC4AssetLock(root: string): Promise<C4AssetLock> {
  const files = await collectAssetFiles(resolve(root));
  return {
    assetRootSha256: sha256(JSON.stringify(files)),
    files,
    schemaVersion: 1,
  };
}

export function serializeC4AssetLock(assetLock: C4AssetLock): string {
  return `${JSON.stringify(assetLock, null, 2)}\n`;
}

export function c4DatasetSpecs(): readonly EpisodeSpec[] {
  return EPISODES;
}

export function c4RepositoryIdForUrl(url: string): C4ControlledRepositoryId {
  const repository = REPOSITORIES.find((candidate) => candidate.url === url);
  if (repository === undefined) {
    throw new Error(`unknown C4 repository URL ${url}`);
  }
  return repository.id;
}

export async function materializeC4SourceRepository(input: {
  datasetRoot: string;
  destination: string;
  repositoryId: C4ControlledRepositoryId;
}): Promise<{ commit: string; tree: string }> {
  const destination = resolve(input.destination);
  await assertAbsent(destination, "C4 source repository destination");
  await mkdir(dirname(destination), { recursive: true });
  await cp(
    join(resolve(input.datasetRoot), "repositories", input.repositoryId),
    destination,
    { recursive: true },
  );
  await initRepository(destination, input.repositoryId);
  return {
    commit: await git(destination, ["rev-parse", "HEAD"]),
    tree: await git(destination, ["rev-parse", "HEAD^{tree}"]),
  };
}

async function writeDatasetAssets(root: string): Promise<void> {
  await writeFile(join(root, "LICENSE"), MIT_LICENSE, "utf8");
  await Promise.all([
    writeRepositories(root),
    writePromptsAndPrehistory(root),
    writeEvaluator(root),
    writeAuthorAttestation(root),
  ]);
  await writeLicenseReceipt(root);
}

async function writeRepositories(root: string): Promise<void> {
  for (const repository of REPOSITORIES) {
    const repositoryRoot = join(root, "repositories", repository.id);
    const tasks = episodeTasks(repository.id);
    await Promise.all([
      writeText(join(repositoryRoot, "AGENTS.md"), [
        "# Contributor Instructions",
        "",
        "- Keep exported signatures stable.",
        "- Do not add dependencies.",
        "- Change only source files needed by the requested utility behavior.",
        "- Run the visible Bun test before finishing.",
        "",
      ].join("\n")),
      writeText(join(repositoryRoot, "LICENSE"), MIT_LICENSE),
      writeText(join(repositoryRoot, "README.md"), [
        `# ${repository.title}`,
        "",
        "A dependency-free TypeScript utility fixture for controlled coding tasks.",
        "The public functions live in `src/tasks.ts` and visible regressions live",
        "in `tests/base-health.test.ts`.",
        "",
      ].join("\n")),
      writeText(join(repositoryRoot, "package.json"), `${JSON.stringify({
        name: `goodmemory-c4-${repository.id}`,
        private: true,
        scripts: { test: "bun test" },
        type: "module",
      }, null, 2)}\n`),
      writeText(
        join(repositoryRoot, "src", "tasks.ts"),
        renderSource(repository, tasks),
      ),
      writeText(
        join(repositoryRoot, "tests", "base-health.test.ts"),
        renderVisibleTest(tasks),
      ),
    ]);
  }
}

async function writePromptsAndPrehistory(root: string): Promise<void> {
  for (const episode of EPISODES) {
    for (const [index, stage] of episode.stages.entries()) {
      await writeText(
        join(root, promptPath(episode.id, stage.id)),
        [
          `# ${episode.id} / stage-${index + 1}`,
          "",
          stage.prompt,
          "",
          "Keep the implementation dependency-free and run the visible test.",
          "",
        ].join("\n"),
      );
    }
    await writeText(
      join(root, prehistoryPath(episode.id)),
      `${episode.history.map((record) => rolloutLine(record.role, record.text)).join("\n")}\n`,
    );
  }
}

async function writeEvaluator(root: string): Promise<void> {
  const cases = EPISODES.flatMap((episode) =>
    episode.stages.map((stage, index) => ({
      episodeId: episode.id,
      failToPass: stage.failToPass,
      functionName: stage.functionName,
      hiddenSentinel: hiddenSentinel(episode.id, `stage-${index + 1}`),
      passToPass: stage.passToPass,
      stageId: `stage-${index + 1}`,
    }))
  );
  await Promise.all([
    writeText(
      join(root, "evaluator", "cases.json"),
      `${JSON.stringify({ cases, schemaVersion: 1 }, null, 2)}\n`,
    ),
    writeText(join(root, "evaluator", "runner.ts"), evaluatorRunner()),
  ]);
}

async function writeLicenseReceipt(root: string): Promise<void> {
  const repositories = REPOSITORIES.map((repository) => ({
    dependencyLock: "not-required-no-dependencies",
    licensePath: `repositories/${repository.id}/LICENSE`,
    licenseSha256: sha256(MIT_LICENSE),
    repositoryId: repository.id,
    sourceLicense: "MIT",
    sourceUrl: repository.url,
  }));
  const receipt = {
    datasetLicense: "MIT",
    datasetLicensePath: "LICENSE",
    datasetLicenseSha256: sha256(MIT_LICENSE),
    patchRedistribution: "permitted-under-source-mit-license",
    rawLogs: "internal-only-not-part-of-dataset",
    repositories,
    sanitizedReadinessReportRedistribution: "permitted",
    schemaVersion: 1,
    taskMaterialLicense: "MIT",
  };
  await writeText(
    join(root, "licenses", "receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

async function writeAuthorAttestation(root: string): Promise<void> {
  const attestation = {
    author: DATASET_AUTHOR,
    authorTaskName: DATASET_AUTHOR_TASK_NAME,
    authoredBeforePairedExecution: true,
    c4AbResultsInspectedBeforeFreeze: false,
    datasetId: DATASET_ID,
    frozenAt: "2026-07-15T20:00:00.000Z",
    schemaVersion: 2,
    scope: "dataset-authoring-only-no-c4-ab-results",
  };
  await writeText(
    join(root, "provenance", "author-attestation.json"),
    `${JSON.stringify(attestation, null, 2)}\n`,
  );
}

async function buildRepositoriesAndGold(
  root: string,
  buildRoot: string,
): Promise<Map<RepositorySpec["id"], { commit: string; tree: string }>> {
  const identities = new Map<RepositorySpec["id"], {
    commit: string;
    tree: string;
  }>();
  for (const repository of REPOSITORIES) {
    const repositoryRoot = join(buildRoot, repository.id);
    await cp(join(root, "repositories", repository.id), repositoryRoot, {
      recursive: true,
    });
    await initRepository(repositoryRoot, repository.id);
    const commit = await git(repositoryRoot, ["rev-parse", "HEAD"]);
    const tree = await git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
    identities.set(repository.id, { commit, tree });

    const baseSource = await readFile(join(repositoryRoot, "src", "tasks.ts"), "utf8");
    const repositoryTasks = episodeTasks(repository.id);
    for (const episode of EPISODES.filter((item) =>
      item.repositoryId === repository.id
    )) {
      for (const [index, stage] of episode.stages.entries()) {
        const goldSource = renderSource(repository, repositoryTasks, stage.id);
        await writeFile(join(repositoryRoot, "src", "tasks.ts"), goldSource, "utf8");
        const patch = await gitRaw(repositoryRoot, [
          "diff",
          "--binary",
          "--full-index",
          "--",
          "src/tasks.ts",
        ]);
        if (patch.length === 0) {
          throw new Error(`C4 gold patch is empty for ${episode.id}/stage-${index + 1}`);
        }
        await writeText(
          join(root, goldPatchPath(episode.id, `stage-${index + 1}`)),
          patch,
        );
        await writeFile(join(repositoryRoot, "src", "tasks.ts"), baseSource, "utf8");
      }
    }
    if (await git(repositoryRoot, ["status", "--porcelain=v1"]) !== "") {
      throw new Error(`C4 materializer left repository ${repository.id} dirty`);
    }
  }
  return identities;
}

async function writeManifest(
  root: string,
  identities: ReadonlyMap<RepositorySpec["id"], {
    commit: string;
    tree: string;
  }>,
): Promise<CodexCodingEffectDatasetV2> {
  const evaluatorCasesSha256 = sha256(
    await readFile(join(root, "evaluator", "cases.json")),
  );
  const manifest = {
    datasetId: DATASET_ID,
    episodes: await Promise.all(EPISODES.map(async (episode) => {
      const repository = repositorySpec(episode.repositoryId);
      const identity = identities.get(repository.id);
      if (identity === undefined) {
        throw new Error(`missing C4 repository identity ${repository.id}`);
      }
      const historyPath = prehistoryPath(episode.id);
      const historySha256 = sha256(await readFile(join(root, historyPath)));
      const forbiddenFileSha256 = [evaluatorCasesSha256];
      const stages = await Promise.all(episode.stages.map(async (stage, index) => {
        const stageId = `stage-${index + 1}`;
        const patchPath = goldPatchPath(episode.id, stageId);
        const patchSha256 = sha256(await readFile(join(root, patchPath)));
        forbiddenFileSha256.push(patchSha256);
        const dependencies = index === 0
          ? []
          : episode.strata
            .filter((stratum) => stratum !== "no-history-negative-control")
            .map((category) => ({
              category,
              description: memoryDependencyDescription(category),
            }));
        return {
          allowedFeedback: index === 0 ? [] : [stage.allowedFeedback],
          expectedChangedFiles: ["src/tasks.ts"],
          goldPatch: { path: patchPath, sha256: patchSha256 },
          hiddenFailToPass: [
            "bun",
            "{evaluatorRoot}/runner.ts",
            "fail-to-pass",
            episode.id,
            stageId,
          ],
          hiddenPassToPass: [
            "bun",
            "{evaluatorRoot}/runner.ts",
            "pass-to-pass",
            episode.id,
            stageId,
          ],
          id: stageId,
          memoryExpectation: {
            dependencies,
            mode: index === 0 ? "none" : episode.memoryMode,
          },
          position: index + 1,
          promptPath: promptPath(episode.id, stage.id),
          snapshot: identity.commit,
          timeoutMs: 30_000,
          visibleTest: ["bun", "test", "tests/base-health.test.ts"],
        };
      }));
      return {
        allowedPublicLeakageValues: await allowedPublicLeakageValues(
          root,
          episode,
        ),
        author: DATASET_AUTHOR,
        claimEligibility: "pilot-only",
        ecosystem: "bun",
        forbiddenLeakage: {
          fileSha256: [...new Set(forbiddenFileSha256)].sort(),
          strings: episode.stages.flatMap((stage, index) => [
            ...stage.forbiddenStrings,
            hiddenSentinel(episode.id, `stage-${index + 1}`),
          ]),
        },
        id: episode.id,
        language: "typescript",
        preparation: {
          command: ["bun", "test", "tests/base-health.test.ts"],
          networkMode: "disabled",
        },
        prehistory: {
          forbiddenLeakageSha256: [...new Set(forbiddenFileSha256)].sort(),
          path: historyPath,
          sha256: historySha256,
          source: "frozen-artifact",
        },
        provenance: "Controlled tasks authored and frozen before any C5 paired execution.",
        repository: {
          baseCommit: identity.commit,
          license: "MIT",
          url: repository.url,
        },
        sourceType: "controlled-mutation",
        stages,
        stateMode: "canonical-snapshot",
        strata: [...episode.strata],
      };
    })),
    schemaVersion: 2,
  } as const;
  const dataset = validateC4ControlledPilotDataset(
    parseCodexCodingEffectDataset(manifest),
  );
  await writeText(
    join(root, "manifest.json"),
    `${JSON.stringify(dataset, null, 2)}\n`,
  );
  return dataset;
}

async function allowedPublicLeakageValues(
  root: string,
  episode: EpisodeSpec,
): Promise<Array<string | number | boolean | null>> {
  const hidden = new Map(
    episode.stages.flatMap((stage) => [
      ...stage.failToPass,
      ...stage.passToPass,
    ]).flatMap((testCase) => [
      ...collectLeakageScalars(testCase.args),
      ...collectLeakageScalars(testCase.expected),
    ]).map((value) => [leakageScalarKey(value), value]),
  );
  const publicSurface = (await Promise.all(
    (await walk(join(root, "repositories", episode.repositoryId)))
      .map((path) => readFile(path, "utf8")),
  )).join("\n");
  return [...hidden.entries()]
    .filter(([, value]) =>
      c4HiddenValueAppearsInSurface(publicSurface, value)
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function collectLeakageScalars(
  value: unknown,
): Array<string | number | boolean | null> {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectLeakageScalars);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectLeakageScalars);
  }
  return [];
}

function leakageScalarKey(value: string | number | boolean | null): string {
  return JSON.stringify({
    type: value === null ? "null" : typeof value,
    value,
  });
}

async function collectAssetFiles(root: string): Promise<C4AssetFile[]> {
  const paths = await walk(root);
  const files: C4AssetFile[] = [];
  for (const absolutePath of paths) {
    const path = relative(root, absolutePath).split("\\").join("/");
    if (
      path === OWNERSHIP_MARKER ||
      path === "asset-lock.json" ||
      path.startsWith("review/") ||
      path.startsWith(".materialize/")
    ) {
      continue;
    }
    const bytes = await readFile(absolutePath);
    files.push({
      bytes: bytes.byteLength,
      kind: assetKind(path),
      path,
      sha256: sha256(bytes),
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`C4 asset closure rejects symlink ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...await walk(path));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`C4 asset closure rejects non-file ${path}`);
    }
    files.push(path);
  }
  return files;
}

function assetKind(path: string): C4AssetFile["kind"] {
  if (path === "manifest.json") return "manifest";
  if (path === "provenance/author-attestation.json") {
    return "author-attestation";
  }
  if (path === "LICENSE") return "dataset-license";
  if (path === "licenses/receipt.json") return "license-receipt";
  if (path.startsWith("repositories/")) return "repository-source";
  if (path.startsWith("prompts/")) return "prompt";
  if (path.startsWith("prehistory/")) return "prehistory";
  if (path.startsWith("evaluator/gold/")) return "gold-patch";
  if (path.startsWith("evaluator/")) return "evaluator";
  throw new Error(`C4 asset kind is not declared for ${path}`);
}

function renderSource(
  repository: RepositorySpec,
  tasks: readonly TaskSpec[],
  goldTaskId?: string,
): string {
  const blocks = [
    repository.preamble.trimEnd(),
    ...tasks.map((task) =>
      goldTaskId === task.id ? task.goldImplementation : task.baseImplementation
    ),
  ].filter((block) => block.length > 0);
  return `${blocks.join("\n\n")}\n`;
}

function renderVisibleTest(tasks: readonly TaskSpec[]): string {
  const cases = tasks.flatMap((task) =>
    task.visible.map((testCase) => ({
      ...testCase,
      functionName: task.functionName,
      taskId: task.id,
    }))
  );
  return [
    'import { describe, expect, it } from "bun:test";',
    'import * as taskModule from "../src/tasks";',
    "",
    `const cases = ${JSON.stringify(cases, null, 2)} as const;`,
    "",
    'describe("visible base health", () => {',
    "  for (const testCase of cases) {",
    "    it(testCase.taskId, () => {",
    "      const candidate = taskModule[testCase.functionName as keyof typeof taskModule];",
    '      if (typeof candidate !== "function") {',
    '        throw new Error(`missing function ${testCase.functionName}`);',
    "      }",
    "      const actual = Reflect.apply(candidate, undefined, [...testCase.args]);",
    "      expect(actual).toEqual(testCase.expected);",
    "    });",
    "  }",
    "});",
    "",
  ].join("\n");
}

function evaluatorRunner(): string {
  return [
    'import { readFile } from "node:fs/promises";',
    'import { resolve } from "node:path";',
    'import { pathToFileURL } from "node:url";',
    'import { isDeepStrictEqual } from "node:util";',
    "",
    "interface EvaluatorCase {",
    "  args: unknown[];",
    "  expected: unknown;",
    "}",
    "",
    "interface StageCases {",
    "  episodeId: string;",
    "  failToPass: EvaluatorCase[];",
    "  functionName: string;",
    "  hiddenSentinel: string;",
    "  passToPass: EvaluatorCase[];",
    "  stageId: string;",
    "}",
    "",
    "const [kind, episodeId, stageId] = process.argv.slice(2);",
    'if ((kind !== "fail-to-pass" && kind !== "pass-to-pass") || !episodeId || !stageId) {',
    '  throw new Error("usage: runner.ts <fail-to-pass|pass-to-pass> <episode> <stage>");',
    "}",
    "const registry = JSON.parse(await readFile(new URL(\"./cases.json\", import.meta.url), \"utf8\")) as {",
    "  cases: StageCases[];",
    "  schemaVersion: 1;",
    "};",
    "const selected = registry.cases.find((candidate) =>",
    "  candidate.episodeId === episodeId && candidate.stageId === stageId",
    ");",
    "if (!selected) {",
    '  throw new Error(`unknown C4 evaluator case ${episodeId}/${stageId}`);',
    "}",
    "const taskModule = await import(pathToFileURL(resolve(process.cwd(), \"src/tasks.ts\")).href) as Record<string, unknown>;",
    "const candidate = taskModule[selected.functionName];",
    'if (typeof candidate !== "function") {',
    '  throw new Error(`missing task function ${selected.functionName}`);',
    "}",
    "const tests = kind === \"fail-to-pass\" ? selected.failToPass : selected.passToPass;",
    "for (const [index, testCase] of tests.entries()) {",
    "  const actual = Reflect.apply(candidate, undefined, testCase.args);",
    "  if (!isDeepStrictEqual(actual, testCase.expected)) {",
    '    const prefix = kind === "fail-to-pass" ? "C4_F2P" : "C4_P2P";',
    "    console.error(`${prefix}|${episodeId}|${stageId}|case-${index + 1}`);",
    "    process.exit(1);",
    "  }",
    "}",
    "",
  ].join("\n");
}

function delimiterTask(
  functionName: string,
  delimiter: string,
  noun: string,
  hiddenInput: string,
  hiddenExpected: [string, string],
): TaskSpec {
  const escapedDelimiter = JSON.stringify(delimiter);
  return task({
    allowedFeedback: `Reuse the validated first-${noun}-delimiter pattern and preserve the complete tail.`,
    baseImplementation: [
      `export function ${functionName}(input: string): [string, string] | null {`,
      `  const [head, tail] = input.split(${escapedDelimiter});`,
      "  return head !== undefined && tail !== undefined ? [head, tail] : null;",
      "}",
    ],
    failToPass: [{ args: [hiddenInput], expected: hiddenExpected }],
    forbiddenStrings: [`const delimiterIndex = input.indexOf(${escapedDelimiter});`],
    functionName,
    goldImplementation: [
      `export function ${functionName}(input: string): [string, string] | null {`,
      `  const delimiterIndex = input.indexOf(${escapedDelimiter});`,
      "  return delimiterIndex === -1",
      "    ? null",
      `    : [input.slice(0, delimiterIndex), input.slice(delimiterIndex + ${delimiter.length})];`,
      "}",
    ],
    id: `${functionName.replace(/[A-Z]/gu, (value) => `-${value.toLowerCase()}`)}-tail`,
    passToPass: [{
      args: [`left${delimiter}right`],
      expected: ["left", "right"],
    }],
    prompt: `Update ${functionName} so additional ${noun} delimiters remain in the value tail while its tuple-or-null contract stays unchanged.`,
    visible: [{
      args: [`key${delimiter}value`],
      expected: ["key", "value"],
    }],
  });
}

function quoteAwareCommentImplementation(): string[] {
  return [
    "export function stripConfigComment(input: string): string {",
    "  let quote: string | null = null;",
    "  for (let index = 0; index < input.length; index += 1) {",
    "    const character = input[index]!;",
    '    if (character === "\\\"" || character === "\'") {',
    "      quote = quote === character ? null : quote ?? character;",
    '    } else if (character === "#" && quote === null) {',
    "      return input.slice(0, index).trimEnd();",
    "    }",
    "  }",
    "  return input.trimEnd();",
    "}",
  ];
}

function tokenizeCommandImplementation(): string[] {
  return [
    "export function tokenizeCommand(input: string): string[] {",
    "  const tokens: string[] = [];",
    '  let current = "";',
    "  let quote: string | null = null;",
    "  for (const character of input.trim()) {",
    '    if (character === "\\\"" || character === "\'") {',
    "      quote = quote === character ? null : quote ?? character;",
    "    } else if (/\\s/u.test(character) && quote === null) {",
    "      if (current.length > 0) {",
    "        tokens.push(current);",
    '        current = "";',
    "      }",
    "    } else {",
    "      current += character;",
    "    }",
    "  }",
    "  if (current.length > 0) {",
    "    tokens.push(current);",
    "  }",
    "  return tokens;",
    "}",
  ];
}

function csvFieldsImplementation(): string[] {
  return [
    "export function parseCsvFields(input: string): string[] {",
    "  const fields: string[] = [];",
    '  let current = "";',
    "  let quoted = false;",
    "  for (const character of input) {",
    '    if (character === "\\\"") {',
    "      quoted = !quoted;",
    '    } else if (character === "," && !quoted) {',
    "      fields.push(current.trim());",
    '      current = "";',
    "    } else {",
    "      current += character;",
    "    }",
    "  }",
    "  fields.push(current.trim());",
    "  return fields;",
    "}",
  ];
}

function task(input: {
  allowedFeedback: string;
  baseImplementation: readonly string[];
  failToPass: readonly JsonCase[];
  forbiddenStrings: readonly string[];
  functionName: string;
  goldImplementation: readonly string[];
  id: string;
  passToPass: readonly JsonCase[];
  prompt: string;
  visible: readonly JsonCase[];
}): TaskSpec {
  return {
    ...input,
    baseImplementation: input.baseImplementation.join("\n"),
    goldImplementation: input.goldImplementation.join("\n"),
  };
}

function episodeTasks(repositoryId: RepositorySpec["id"]): TaskSpec[] {
  return EPISODES.filter((episode) => episode.repositoryId === repositoryId)
    .flatMap((episode) => episode.stages);
}

function repositorySpec(id: RepositorySpec["id"]): RepositorySpec {
  const repository = REPOSITORIES.find((candidate) => candidate.id === id);
  if (repository === undefined) {
    throw new Error(`unknown C4 repository ${id}`);
  }
  return repository;
}

function promptPath(episodeId: string, taskId: string): string {
  return `prompts/${episodeId}-${taskId}.md`;
}

function prehistoryPath(episodeId: string): string {
  return `prehistory/${episodeId}.jsonl`;
}

function goldPatchPath(episodeId: string, stageId: string): string {
  return `evaluator/gold/${episodeId}-${stageId}.patch`;
}

function hiddenSentinel(episodeId: string, stageId: string): string {
  return `C4_HIDDEN|${episodeId}|${stageId}`;
}

function memoryDependencyDescription(category: MemoryStratum): string {
  const descriptions: Record<MemoryStratum, string> = {
    "failure-avoidance": "Avoid the previously disproved parsing shortcut.",
    "irrelevant-memory-negative-control": "Recognize that the frozen history is unrelated to the coding task.",
    "no-history-negative-control": "No prior history is available at the first stage.",
    "open-loop-handoff": "Continue the concrete endpoint-parser follow-up across stages.",
    "project-convention": "Apply the repository ParseResult convention.",
    "stale-update": "Use the newer seconds input contract instead of the superseded unit.",
    "user-correction": "Honor the user's correction against coercion and unchecked values.",
    "validated-approach": "Reuse the validated first-delimiter implementation pattern.",
  };
  return descriptions[category];
}

async function initRepository(root: string, id: string): Promise<void> {
  await git(root, ["init", "--quiet"]);
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=GoodMemory C4 Fixture",
    "-c",
    "user.email=c4-fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    `Freeze ${id} controlled base`,
  ], {
    ...process.env,
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
  });
}

async function git(
  cwd: string,
  args: readonly string[],
  env?: Record<string, string | undefined>,
): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    env,
    executable: "git",
    timeoutMs: 30_000,
  });
  if (result.spawnError !== undefined || result.timedOut || result.exitCode !== 0) {
    throw new Error(
      `C4 git ${args[0] ?? "command"} failed: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function gitRaw(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 30_000,
  });
  if (result.spawnError !== undefined || result.timedOut || result.exitCode !== 0) {
    throw new Error(
      `C4 git ${args[0] ?? "command"} failed: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { encoding: "utf8", flag: "wx" });
}

function rolloutLine(role: "assistant" | "user", text: string): string {
  return JSON.stringify({
    payload: {
      content: [{
        text,
        type: role === "user" ? "input_text" : "output_text",
      }],
      role,
      type: "message",
    },
    type: "response_item",
  });
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function assertAbsent(path: string, label: string): Promise<void> {
  if (await pathExists(path)) {
    throw new Error(`${label} already exists: ${path}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}
