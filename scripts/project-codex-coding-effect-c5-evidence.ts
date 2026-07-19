import { resolve } from "node:path";

import {
  projectC5RunEvidence,
} from "./codex-coding-effect/c5-evidence";

const options = parseOptions(process.argv.slice(2));
const manifest = await projectC5RunEvidence(options);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

function parseOptions(args: readonly string[]): {
  outputDirectory: string;
  rawRunDirectory: string;
} {
  const values = optionValues(args);
  const rawRunDirectory = values.get("--raw-run-directory");
  const outputDirectory = values.get("--output-directory");
  if (
    rawRunDirectory === undefined ||
    outputDirectory === undefined ||
    values.size !== 2
  ) {
    throw new Error(
      "usage: --raw-run-directory <path> --output-directory <path>",
    );
  }
  return {
    outputDirectory: resolve(outputDirectory),
    rawRunDirectory: resolve(rawRunDirectory),
  };
}

function optionValues(args: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      !name.startsWith("--") ||
      value.startsWith("--") ||
      values.has(name)
    ) {
      throw new Error(
        "usage: --raw-run-directory <path> --output-directory <path>",
      );
    }
    values.set(name, value);
  }
  return values;
}
