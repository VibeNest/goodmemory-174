import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type ParsedArgs = Record<string, string>;

function parseArgs(argv: string[]): { command?: string; flags: ParsedArgs } {
  const [command, ...rest] = argv;
  const flags: ParsedArgs = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (value && !value.startsWith("--")) {
      flags[key] = value;
      index += 1;
      continue;
    }

    flags[key] = "true";
  }

  return {
    command,
    flags,
  };
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

function requireFlag(flags: ParsedArgs, name: string): string {
  const value = flags[name];
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

async function inspectCase(runDir: string, caseId: string): Promise<string> {
  const artifact = await readJson<{
    judge: { winner: string };
    goodmemory?: {
      retrieved?: {
        preferences?: unknown[];
        references?: unknown[];
        facts?: unknown[];
        feedback?: unknown[];
        episodes?: unknown[];
      };
      trace?: { recallHitCount?: number };
    };
  }>(join(runDir, "cases", `${caseId}.json`));

  const retrieved = artifact.goodmemory?.retrieved;

  return [
    `Case: ${caseId}`,
    `Winner: ${artifact.judge.winner}`,
    `References: ${retrieved?.references?.length ?? 0}`,
    `Facts: ${retrieved?.facts?.length ?? 0}`,
    `Feedback: ${retrieved?.feedback?.length ?? 0}`,
    `Episodes: ${retrieved?.episodes?.length ?? 0}`,
    `Recall Hits: ${artifact.goodmemory?.trace?.recallHitCount ?? 0}`,
  ].join("\n");
}

async function traceCase(runDir: string, caseId: string): Promise<string> {
  const goodmemory = await readJson<{
    trace: {
      rememberEvents: Array<{
        sessionId: string;
        accepted: number;
        rejected: number;
        events?: Array<{
          memoryType: string;
          reason?: string;
        }>;
      }>;
    };
  }>(join(runDir, "traces", caseId, "goodmemory.json"));
  const recall = await readJson<{
    hits?: Array<{ type: string; reason?: string }>;
    verificationHints?: Array<{ memoryType: string; reason: string }>;
  }>(join(runDir, "traces", caseId, "raw-recall.json"));

  const writeLines = goodmemory.trace.rememberEvents.flatMap((session) => {
    const header = `- ${session.sessionId}: accepted=${session.accepted}, rejected=${session.rejected}`;
    const events = (session.events ?? []).map(
      (event) => `  * ${event.memoryType}: ${event.reason ?? "no_reason"}`,
    );
    return [header, ...events];
  });

  const hitLines = (recall.hits ?? []).map(
    (hit) => `- ${hit.type}: ${hit.reason ?? "no_reason"}`,
  );
  const verificationLines = (recall.verificationHints ?? []).map(
    (hint) => `- ${hint.memoryType}: ${hint.reason}`,
  );

  return [
    "Write Trace",
    ...writeLines,
    "",
    "Recall Hits",
    ...hitLines,
    "",
    "Verification Hints",
    ...(verificationLines.length > 0 ? verificationLines : ["- none"]),
  ].join("\n");
}

async function exportCase(
  runDir: string,
  caseId: string,
  outputPath: string,
): Promise<string> {
  await copyFile(
    join(runDir, "cases", `${caseId}.json`),
    outputPath,
  );

  return `Exported case artifact to ${outputPath}`;
}

export async function runCLI(argv: string[]): Promise<CLIResult> {
  try {
    const { command, flags } = parseArgs(argv);

    if (!command) {
      throw new Error("Missing command");
    }

    const runDir = requireFlag(flags, "run-dir");
    const caseId = requireFlag(flags, "case-id");

    if (command === "inspect") {
      return {
        stdout: await inspectCase(runDir, caseId),
        stderr: "",
        exitCode: 0,
      };
    }

    if (command === "trace") {
      return {
        stdout: await traceCase(runDir, caseId),
        stderr: "",
        exitCode: 0,
      };
    }

    if (command === "export") {
      const outputPath = requireFlag(flags, "output");

      return {
        stdout: await exportCase(runDir, caseId, outputPath),
        stderr: "",
        exitCode: 0,
      };
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}
