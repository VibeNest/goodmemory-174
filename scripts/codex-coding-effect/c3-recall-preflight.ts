import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type {
  C3BoundaryRunner,
  C3InstalledArmRuntime,
  C3SeedResult,
} from "./c3-runtime";
import { buildNativeCanarySessionDigest } from "./native-canary-contracts";
import { parseNativeCanaryInjectionState } from "./native-canary-state";
import { runBoundaryProcess } from "./process";
import type { BoundaryProcessResult } from "./process";

const hookOutputSchema = z.object({
  hookSpecificOutput: z.object({
    additionalContext: z.string().trim().min(1),
    hookEventName: z.literal("UserPromptSubmit"),
  }).passthrough(),
}).passthrough();

interface C3RecallPreflightEvidenceBase {
  expectedMemoryIds: string[];
  injectedMemoryIds: string[];
  schemaVersion: 1;
  sourceProjectionSha256?: string;
}

export type C3RecallPreflightEvidence =
  | C3RecallPreflightEvidenceBase & {
      outputSha256: string;
      passed: true;
      stateSha256: string;
    }
  | C3RecallPreflightEvidenceBase & {
      outputSha256: string | null;
      passed: false;
      reason: string;
      stateSha256: string | null;
    };

export async function preflightC3InstalledRecall(input: {
  prompt: string;
  runProcess?: C3BoundaryRunner;
  runtime: C3InstalledArmRuntime;
  seed: C3SeedResult;
}): Promise<C3RecallPreflightEvidence> {
  const expectedMemoryIds = [...new Set(
    input.seed.receipt.writtenMemoryIds,
  )].sort();
  const run = input.runProcess ?? runBoundaryProcess;
  const sessionId = `${input.runtime.plan.scopes.sessionId}-recall-preflight`;
  const sessionDigest = buildNativeCanarySessionDigest(sessionId);
  let output: string | null = null;
  let stateRaw: string | null = null;
  let injectedMemoryIds: string[] = [];
  let hookOutput: z.infer<typeof hookOutputSchema>["hookSpecificOutput"] | null =
    null;
  let injectionEvents: ReturnType<typeof parseNativeCanaryInjectionState> = [];
  let evidence: C3RecallPreflightEvidence;
  try {
    output = (await runRequired(run, {
      args: ["codex", "hook", "user-prompt-submit"],
      cwd: input.runtime.plan.paths.workspace,
      env: input.runtime.env,
      executable: input.runtime.goodmemoryExecutable,
      label: "frozen-prehistory-recall-preflight",
      stdin: JSON.stringify({
        cwd: input.runtime.plan.paths.workspace,
        hook_event_name: "UserPromptSubmit",
        prompt: input.prompt,
        session_id: sessionId,
        turn_id: `${sessionId}-turn`,
      }),
    })).stdout;
    hookOutput = parseExternalJson(
      output,
      hookOutputSchema,
      "C3 recall preflight output",
    ).hookSpecificOutput;
    stateRaw = await readFile(
      join(
        input.runtime.plan.paths.home,
        ".goodmemory",
        "codex-injection-state.json",
      ),
      "utf8",
    );
    injectionEvents = parseNativeCanaryInjectionState(stateRaw).filter(
      (event) => event.sessionDigest === sessionDigest,
    );
    injectedMemoryIds = [...new Set(
      injectionEvents
        .filter((event) =>
          event.command === "user-prompt-submit" &&
          event.decision === "injected"
        )
        .flatMap((event) => event.recordIds)
        .filter((memoryId) => expectedMemoryIds.includes(memoryId)),
    )].sort();
    if (
      expectedMemoryIds.length === 0 ||
      injectedMemoryIds.length !== expectedMemoryIds.length
    ) {
      throw new Error("frozen prehistory is not retrievable before Codex execution");
    }
    evidence = {
      expectedMemoryIds,
      injectedMemoryIds,
      outputSha256: sha256(output),
      passed: true,
      schemaVersion: 1,
      stateSha256: sha256(stateRaw),
    };
  } catch (error) {
    evidence = {
      expectedMemoryIds,
      injectedMemoryIds,
      outputSha256: output === null ? null : sha256(output),
      passed: false,
      reason: error instanceof Error ? error.message : String(error),
      schemaVersion: 1,
      stateSha256: stateRaw === null ? null : sha256(stateRaw),
    };
  }
  const sourceProjectionBytes = `${JSON.stringify({
    hookOutput: hookOutput === null
      ? null
      : {
          additionalContextLength: hookOutput.additionalContext.length,
          additionalContextSha256: sha256(hookOutput.additionalContext),
          hookEventName: hookOutput.hookEventName,
        },
    injectionEvents: injectionEvents.map((event) => ({
      command: event.command,
      decision: event.decision,
      recordIds: event.recordIds,
      sessionDigest: event.sessionDigest,
    })),
    schemaVersion: 1,
    sessionDigest,
  }, null, 2)}\n`;
  await writeFile(
    join(
      input.runtime.plan.paths.result,
      "recall-preflight-source.sanitized.json",
    ),
    sourceProjectionBytes,
    { encoding: "utf8", flag: "wx" },
  );
  evidence = {
    ...evidence,
    sourceProjectionSha256: sha256(sourceProjectionBytes),
  };
  await writeFile(
    join(input.runtime.plan.paths.result, "recall-preflight.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return evidence;
}

async function runRequired(
  run: C3BoundaryRunner,
  input: {
    args: readonly string[];
    cwd: string;
    env: Record<string, string>;
    executable: string;
    label: string;
    stdin?: string;
  },
): Promise<BoundaryProcessResult> {
  const result = await run({
    args: input.args,
    cwd: input.cwd,
    env: input.env,
    executable: input.executable,
    stdin: input.stdin,
    timeoutMs: 120_000,
  });
  if (result.spawnError !== undefined) {
    throw new Error(`${input.label} failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error(`${input.label} timed out`);
  }
  if (result.exitCode !== 0) {
    throw new Error(`${input.label} exited with code ${result.exitCode}`);
  }
  return result;
}

function parseExternalJson<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} failed schema validation`);
  }
  return result.data;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
