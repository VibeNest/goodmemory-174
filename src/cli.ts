import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type ParsedArgs = Record<string, string>;

interface ProposalLifecycleTrace {
  experienceCount: number;
  experienceKindCounts?: Record<string, number>;
  proposalCount: number;
  proposalStatusCounts?: Record<string, number>;
  promotionCount: number;
  promotionDecisionCounts?: Record<string, number>;
  proposals: Array<{
    id: string;
    proposalType: string;
    status: string;
    summary: string;
    sourceExperienceIds: string[];
    linkedMemoryIds: string[];
    linkedArchiveIds: string[];
    linkedEvidenceIds: string[];
  }>;
  promotions: Array<{
    proposalId: string;
    decision: string;
    policyOutcome: string;
    verificationOutcome: string;
    evalOutcome: string;
  }>;
}

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

function formatCountBreakdown(
  counts: Record<string, number> | undefined,
): string | null {
  if (!counts || Object.keys(counts).length === 0) {
    return null;
  }

  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function formatCountLine(
  label: string,
  total: number | undefined,
  counts: Record<string, number> | undefined,
): string {
  if (total === undefined) {
    return `${label}: unknown`;
  }

  const breakdown = formatCountBreakdown(counts);
  return breakdown ? `${label}: ${total} (${breakdown})` : `${label}: ${total}`;
}

function clipText(content: string, maxLength = 100): string {
  return content.length <= maxLength ? content : `${content.slice(0, maxLength - 3)}...`;
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
        archives?: unknown[];
        evidence?: unknown[];
        preferences?: unknown[];
        references?: unknown[];
        facts?: unknown[];
        feedback?: unknown[];
        episodes?: unknown[];
        policyApplied?: string[];
      };
      trace?: {
        recallHitCount?: number;
        proposalLifecycle?: ProposalLifecycleTrace | null;
      };
    };
  }>(join(runDir, "cases", `${caseId}.json`));

  const retrieved = artifact.goodmemory?.retrieved;
  const proposalLifecycle = artifact.goodmemory?.trace?.proposalLifecycle ?? null;

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
    `Archives: ${retrieved?.archives?.length ?? 0}`,
    `Evidence: ${retrieved?.evidence?.length ?? 0}`,
    `Episodes: ${retrieved?.episodes?.length ?? 0}`,
    formatCountLine(
      "Experience Records",
      proposalLifecycle?.experienceCount,
      proposalLifecycle?.experienceKindCounts,
    ),
    formatCountLine(
      "Proposals",
      proposalLifecycle?.proposalCount,
      proposalLifecycle?.proposalStatusCounts,
    ),
    formatCountLine(
      "Promotions",
      proposalLifecycle?.promotionCount,
      proposalLifecycle?.promotionDecisionCounts,
    ),
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
      proposalLifecycle?: ProposalLifecycleTrace | null;
    };
  }>(join(runDir, "traces", caseId, "goodmemory.json"));
  const assertions = await readOptionalJson<{
    passed: boolean;
    checks: Array<{ id: string; passed: boolean; details: string[] }>;
    contaminationFindings: string[];
    updateFindings: string[];
  }>(join(runDir, "traces", caseId, "assertions.json"));
  const recall = await readJson<{
    routingDecision?: {
      strategy?: string;
      strategyExplanation?: {
        summary?: string;
      };
    };
    hits?: Array<{ type: string; reason?: string; evidenceIds?: string[] }>;
    verificationHints?: Array<{ memoryType: string; reason: string; evidenceIds?: string[] }>;
    policyApplied?: string[];
  }>(join(runDir, "traces", caseId, "raw-recall.json"));
  const proposalTrace =
    (await readOptionalJson<ProposalLifecycleTrace>(
      join(runDir, "traces", caseId, "proposal-trace.json"),
    )) ??
    goodmemory.trace.proposalLifecycle ??
    null;

  const writeLines = goodmemory.trace.rememberEvents.flatMap((session) => {
    const header = `- ${session.sessionId}: accepted=${session.accepted}, rejected=${session.rejected}`;
    const events = (session.events ?? []).map(
      (event) => `  * ${event.memoryType}: ${event.reason ?? "no_reason"}`,
    );
    return [header, ...events];
  });

  const hitLines = (recall.hits ?? []).map(
    (hit) =>
      `- ${hit.type}: ${hit.reason ?? "no_reason"}${
        hit.evidenceIds?.length ? ` [evidence=${hit.evidenceIds.join(",")}]` : ""
      }`,
  );
  const routerLines = recall.routingDecision
    ? [
        `- strategy: ${recall.routingDecision.strategy ?? "unknown"}`,
        `- explanation: ${
          recall.routingDecision.strategyExplanation?.summary ?? "no_explanation"
        }`,
      ]
    : ["- unavailable"];
  const verificationLines = (recall.verificationHints ?? []).map(
    (hint) =>
      `- ${hint.memoryType}: ${hint.reason}${
        hint.evidenceIds?.length ? ` [evidence=${hint.evidenceIds.join(",")}]` : ""
      }`,
  );
  const policyLines = (recall.policyApplied ?? []).map((policy) => `- ${policy}`);
  const proposalLines = proposalTrace
    ? [
        `- experiences: ${proposalTrace.experienceCount}${
          formatCountBreakdown(proposalTrace.experienceKindCounts)
            ? ` [${formatCountBreakdown(proposalTrace.experienceKindCounts)}]`
            : ""
        }`,
        `- proposals: ${proposalTrace.proposalCount}${
          formatCountBreakdown(proposalTrace.proposalStatusCounts)
            ? ` [${formatCountBreakdown(proposalTrace.proposalStatusCounts)}]`
            : ""
        }`,
        ...proposalTrace.proposals.map(
          (proposal) =>
            `- ${proposal.proposalType} / ${proposal.status}: ${clipText(proposal.summary)} ` +
            `[source=${proposal.sourceExperienceIds.length} memory=${proposal.linkedMemoryIds.length} ` +
            `archive=${proposal.linkedArchiveIds.length} evidence=${proposal.linkedEvidenceIds.length}]`,
        ),
      ]
    : ["- unavailable"];
  const promotionLines = proposalTrace
    ? proposalTrace.promotions.map(
        (promotion) =>
          `- ${promotion.proposalId} -> ${promotion.decision} ` +
          `[policy=${promotion.policyOutcome} verification=${promotion.verificationOutcome} eval=${promotion.evalOutcome}]`,
      )
    : ["- unavailable"];
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
    "Router Strategy",
    ...routerLines,
    "",
    "Verification Hints",
    ...(verificationLines.length > 0 ? verificationLines : ["- none"]),
    "",
    "Policy Applied",
    ...(policyLines.length > 0 ? policyLines : ["- none"]),
    "",
    "Proposal Lifecycle",
    ...(proposalLines.length > 0 ? proposalLines : ["- none"]),
    "",
    "Promotion Decisions",
    ...(promotionLines.length > 0 ? promotionLines : ["- none"]),
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
