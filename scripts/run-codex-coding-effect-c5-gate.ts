import { join, resolve } from "node:path";

import {
  persistC5EvidenceGate,
  runC5EvidenceGate,
} from "./codex-coding-effect/c5-evidence";

const options = parseOptions(process.argv.slice(2));
const gate = await runC5EvidenceGate(options);
await persistC5EvidenceGate({
  gate,
  path: options.outputPath ?? join(options.projectionDirectory, "c5-gate.json"),
});
process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
if (gate.decision !== "accepted") process.exitCode = 1;

function parseOptions(args: readonly string[]): {
  outputPath?: string;
  projectionDirectory: string;
  reviewPath?: string;
  reviewProvenancePath?: string;
  verificationPath?: string;
} {
  const values = optionValues(args);
  const projectionDirectory = values.get("--projection-directory");
  const allowed = new Set([
    "--output",
    "--projection-directory",
    "--review",
    "--review-provenance",
    "--verification",
  ]);
  if (
    projectionDirectory === undefined ||
    [...values.keys()].some((name) => !allowed.has(name))
  ) {
    throw new Error(
      "usage: --projection-directory <path> [--verification <path>] " +
        "[--review <path>] [--review-provenance <path>] [--output <path>]",
    );
  }
  const outputPath = values.get("--output");
  const reviewPath = values.get("--review");
  const reviewProvenancePath = values.get("--review-provenance");
  const verificationPath = values.get("--verification");
  return {
    ...(outputPath === undefined ? {} : { outputPath: resolve(outputPath) }),
    projectionDirectory: resolve(projectionDirectory),
    ...(reviewPath === undefined ? {} : { reviewPath: resolve(reviewPath) }),
    ...(reviewProvenancePath === undefined
      ? {}
      : { reviewProvenancePath: resolve(reviewProvenancePath) }),
    ...(verificationPath === undefined
      ? {}
      : { verificationPath: resolve(verificationPath) }),
  };
}

function optionValues(args: readonly string[]): Map<string, string> {
  const usage =
    "usage: --projection-directory <path> [--verification <path>] " +
    "[--review <path>] [--review-provenance <path>] [--output <path>]";
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
      throw new Error(usage);
    }
    values.set(name, value);
  }
  return values;
}
