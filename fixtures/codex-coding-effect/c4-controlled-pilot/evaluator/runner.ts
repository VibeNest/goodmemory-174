import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

interface EvaluatorCase {
  args: unknown[];
  expected: unknown;
}

interface StageCases {
  episodeId: string;
  failToPass: EvaluatorCase[];
  functionName: string;
  hiddenSentinel: string;
  passToPass: EvaluatorCase[];
  stageId: string;
}

const [kind, episodeId, stageId] = process.argv.slice(2);
if ((kind !== "fail-to-pass" && kind !== "pass-to-pass") || !episodeId || !stageId) {
  throw new Error("usage: runner.ts <fail-to-pass|pass-to-pass> <episode> <stage>");
}
const registry = JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8")) as {
  cases: StageCases[];
  schemaVersion: 1;
};
const selected = registry.cases.find((candidate) =>
  candidate.episodeId === episodeId && candidate.stageId === stageId
);
if (!selected) {
  throw new Error(`unknown C4 evaluator case ${episodeId}/${stageId}`);
}
const taskModule = await import(pathToFileURL(resolve(process.cwd(), "src/tasks.ts")).href) as Record<string, unknown>;
const candidate = taskModule[selected.functionName];
if (typeof candidate !== "function") {
  throw new Error(`missing task function ${selected.functionName}`);
}
const tests = kind === "fail-to-pass" ? selected.failToPass : selected.passToPass;
for (const [index, testCase] of tests.entries()) {
  const actual = Reflect.apply(candidate, undefined, testCase.args);
  if (!isDeepStrictEqual(actual, testCase.expected)) {
    const prefix = kind === "fail-to-pass" ? "C4_F2P" : "C4_P2P";
    console.error(`${prefix}|${episodeId}|${stageId}|case-${index + 1}`);
    process.exit(1);
  }
}
