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

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

function requireFlag(flags: ParsedArgs, name: string): string {
  const value = flags[name];
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

async function inspectCase(runDir: string, caseId: string): Promise<string> {
  const report = await readJson<{
    mode?: string;
    runtime?: {
      generationMode?: string;
      judgeMode?: string;
    };
  }>(join(runDir, "report.json"));
  const artifact = await readJson<{
    metadata?: {
      taskFamily?: string;
      targetDomain?: string;
      memorySourceDomains?: string[];
      evaluationSetting?: string;
    };
    assertions?: {
      passed?: boolean;
      totalChecks?: number;
      passedChecks?: number;
      contaminationFindings?: string[];
      updateFindings?: string[];
    };
    judge: { winner: string };
    goodmemory?: {
      retrieved?: {
        preferences?: unknown[];
        references?: unknown[];
        facts?: unknown[];
        feedback?: unknown[];
        episodes?: unknown[];
        policyApplied?: string[];
      };
      trace?: { recallHitCount?: number };
    };
  }>(join(runDir, "cases", `${caseId}.json`));

  const retrieved = artifact.goodmemory?.retrieved;

  return [
    `Run Mode: ${report.mode ?? "unknown"}`,
    `Runtime: generation=${report.runtime?.generationMode ?? "unknown"}, judge=${report.runtime?.judgeMode ?? "unknown"}`,
    `Case: ${caseId}`,
    `Task Family: ${artifact.metadata?.taskFamily ?? "unknown"}`,
    `Setting: ${artifact.metadata?.evaluationSetting ?? "unknown"}`,
    `Target Domain: ${artifact.metadata?.targetDomain ?? "unknown"}`,
    `Memory Source Domains: ${
      artifact.metadata?.memorySourceDomains?.join(", ") ?? "unknown"
    }`,
    `Winner: ${artifact.judge.winner}`,
    `References: ${retrieved?.references?.length ?? 0}`,
    `Facts: ${retrieved?.facts?.length ?? 0}`,
    `Feedback: ${retrieved?.feedback?.length ?? 0}`,
    `Episodes: ${retrieved?.episodes?.length ?? 0}`,
    `Recall Hits: ${artifact.goodmemory?.trace?.recallHitCount ?? 0}`,
    `Assertions: ${
      artifact.assertions
        ? `${artifact.assertions.passedChecks ?? 0}/${artifact.assertions.totalChecks ?? 0} passed`
        : "unknown"
    }`,
    `Contamination Findings: ${
      artifact.assertions?.contaminationFindings?.length ?? 0
    }`,
    `Update Findings: ${artifact.assertions?.updateFindings?.length ?? 0}`,
    `Policy Applied: ${
      retrieved?.policyApplied?.length
        ? retrieved.policyApplied.join(", ")
        : "none"
    }`,
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
  const assertions = await readOptionalJson<{
    passed: boolean;
    checks: Array<{ id: string; passed: boolean; details: string[] }>;
    contaminationFindings: string[];
    updateFindings: string[];
  }>(join(runDir, "traces", caseId, "assertions.json"));
  const recall = await readJson<{
    hits?: Array<{ type: string; reason?: string }>;
    verificationHints?: Array<{ memoryType: string; reason: string }>;
    policyApplied?: string[];
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
  const policyLines = (recall.policyApplied ?? []).map((policy) => `- ${policy}`);
  const assertionLines = assertions
    ? assertions.checks.map(
        (check) =>
          `- ${check.id}: ${check.passed ? "pass" : "fail"} (${check.details.join(", ")})`,
      )
    : ["- unavailable (legacy run)"];

  return [
    "Write Trace",
    ...writeLines,
    "",
    "Recall Hits",
    ...hitLines,
    "",
    "Verification Hints",
    ...(verificationLines.length > 0 ? verificationLines : ["- none"]),
    "",
    "Policy Applied",
    ...(policyLines.length > 0 ? policyLines : ["- none"]),
    "",
    "Assertions",
    ...assertionLines,
    "",
    "Contamination Findings",
    ...(assertions?.contaminationFindings.length
      ? assertions.contaminationFindings.map((finding) => `- ${finding}`)
      : ["- none"]),
    "",
    "Update Findings",
    ...(assertions?.updateFindings.length
      ? assertions.updateFindings.map((finding) => `- ${finding}`)
      : ["- none"]),
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
