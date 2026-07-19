import { join, resolve } from "node:path";

import {
  persistC5EvidenceVerification,
  verifyC5EvidenceProjection,
} from "./codex-coding-effect/c5-evidence";

const options = parseOptions(process.argv.slice(2));
const verification = await verifyC5EvidenceProjection({
  projectionDirectory: options.projectionDirectory,
});
await persistC5EvidenceVerification({
  path: options.outputPath ??
    join(options.projectionDirectory, "c5-verification.json"),
  verification,
});
process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
if (verification.decision !== "accepted") process.exitCode = 1;

function parseOptions(args: readonly string[]): {
  outputPath?: string;
  projectionDirectory: string;
} {
  const values = optionValues(args);
  const projectionDirectory = values.get("--projection-directory");
  const outputPath = values.get("--output");
  if (
    projectionDirectory === undefined ||
    [...values.keys()].some((name) =>
      name !== "--projection-directory" && name !== "--output"
    )
  ) {
    throw new Error(
      "usage: --projection-directory <path> [--output <path>]",
    );
  }
  return {
    ...(outputPath === undefined ? {} : { outputPath: resolve(outputPath) }),
    projectionDirectory: resolve(projectionDirectory),
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
        "usage: --projection-directory <path> [--output <path>]",
      );
    }
    values.set(name, value);
  }
  return values;
}
