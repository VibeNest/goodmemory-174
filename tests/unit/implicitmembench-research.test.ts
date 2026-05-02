import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BuildContextResult,
  DeleteAllMemoryResult,
  ExportMemoryResult,
  FeedbackResult,
  ForgetResult,
  GoodMemory,
  RecallResult,
  RememberResult,
  ReviseMemoryResult,
  RunMaintenanceResult,
} from "../../src/api/contracts";
import type { MemoryScope } from "../../src/domain/scope";
import {
  createImplicitMemBenchSmokeDependencies,
  detectExplicitRecallLeak,
  listImplicitMemBenchResearchCases,
  runImplicitMemBenchBaselineEval,
  runImplicitMemBenchComparisonEval,
  runImplicitMemBenchGoodMemoryEval,
  validateImplicitMemBenchAdapterManifest,
  withImplicitMemBenchTimeout,
} from "../../src/eval/implicitmembench-research";

const FIXTURE_ROOT =
  "/Users/hjqcan/Documents/GoodMomery/fixtures/implicitmembench-research";
const MANIFEST_PATH = `${FIXTURE_ROOT}/adapter-manifest.json`;

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function createConditioningBenchmarkRoot(input: {
  feedbackSignal: string;
  instances: unknown[];
  taskFile: string;
}): Promise<{ benchmarkRoot: string; manifestPath: string }> {
  const benchmarkRoot = await createTempDir("phase49-conditioning-benchmark");
  await mkdir(join(benchmarkRoot, "dataset", "classical_conditioning"), {
    recursive: true,
  });
  await mkdir(join(benchmarkRoot, "dataset", "priming"), { recursive: true });
  await mkdir(join(benchmarkRoot, "dataset", "procedural_memory"), {
    recursive: true,
  });
  await writeFile(
    join(
      benchmarkRoot,
      "dataset",
      "classical_conditioning",
      input.taskFile,
    ),
    `${JSON.stringify(
      {
        instances: input.instances,
        task_count: input.instances.length,
        task_seed: "test-conditioning",
      },
      null,
      2,
    )}\n`,
  );

  const manifestPath = join(benchmarkRoot, "adapter-manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        datasets: {
          classical_conditioning: {
            [input.taskFile]: {
              scorer: "text_behavior_judge",
              feedbackSignal: input.feedbackSignal,
            },
          },
          priming: {},
          procedural_memory: {},
        },
      },
      null,
      2,
    )}\n`,
  );

  return { benchmarkRoot, manifestPath };
}

async function createProceduralBenchmarkRoot(input: {
  feedbackSignal: string;
  instances: unknown[];
  taskFile: string;
}): Promise<{ benchmarkRoot: string; manifestPath: string }> {
  const benchmarkRoot = await createTempDir("phase49-procedural-benchmark");
  await mkdir(join(benchmarkRoot, "dataset", "classical_conditioning"), {
    recursive: true,
  });
  await mkdir(join(benchmarkRoot, "dataset", "priming"), { recursive: true });
  await mkdir(join(benchmarkRoot, "dataset", "procedural_memory"), {
    recursive: true,
  });
  await writeFile(
    join(
      benchmarkRoot,
      "dataset",
      "procedural_memory",
      input.taskFile,
    ),
    `${JSON.stringify(
      {
        instances: input.instances,
        task_count: input.instances.length,
        task_seed: "test-procedural",
      },
      null,
      2,
    )}\n`,
  );

  const manifestPath = join(benchmarkRoot, "adapter-manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        datasets: {
          classical_conditioning: {},
          priming: {},
          procedural_memory: {
            [input.taskFile]: {
              scorer: "text_behavior_judge",
              feedbackSignal: input.feedbackSignal,
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );

  return { benchmarkRoot, manifestPath };
}

async function createStructuredProceduralBenchmarkRoot(input: {
  expectedFirstAction: {
    args?: string[];
    kind: "command" | "tool_call" | "warning";
    name: string;
    raw?: string;
  };
  feedbackSignal: string;
  forbiddenFirstAction: {
    args?: string[];
    kind: "command" | "tool_call" | "warning";
    name: string;
    raw?: string;
  };
  instances: unknown[];
  taskFile: string;
}): Promise<{ benchmarkRoot: string; manifestPath: string }> {
  const benchmarkRoot = await createTempDir("phase49-structured-benchmark");
  await mkdir(join(benchmarkRoot, "dataset", "classical_conditioning"), {
    recursive: true,
  });
  await mkdir(join(benchmarkRoot, "dataset", "priming"), { recursive: true });
  await mkdir(join(benchmarkRoot, "dataset", "procedural_memory"), {
    recursive: true,
  });
  await writeFile(
    join(
      benchmarkRoot,
      "dataset",
      "procedural_memory",
      input.taskFile,
    ),
    `${JSON.stringify(
      {
        instances: input.instances,
        task_count: input.instances.length,
        task_seed: "test-structured-procedural",
      },
      null,
      2,
    )}\n`,
  );

  const manifestPath = join(benchmarkRoot, "adapter-manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        datasets: {
          classical_conditioning: {},
          priming: {},
          procedural_memory: {
            [input.taskFile]: {
              expectedFirstAction: input.expectedFirstAction,
              feedbackSignal: input.feedbackSignal,
              forbiddenFirstAction: input.forbiddenFirstAction,
              scorer: "structured_first_action",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );

  return { benchmarkRoot, manifestPath };
}

function createDeleteAllMemoryResult(scope: MemoryScope): DeleteAllMemoryResult {
  return {
    deleted: {
      archives: 0,
      artifactSpills: 0,
      episodes: 0,
      evidence: 0,
      experiences: 0,
      facts: 0,
      feedback: 0,
      journal: 0,
      preferences: 0,
      profiles: 0,
      promotions: 0,
      proposals: 0,
      references: 0,
      workingMemory: 0,
    },
    scope,
  };
}

function createTrackingMemory(deletedScopes: MemoryScope[]): GoodMemory {
  return {
    buildContext: async (): Promise<BuildContextResult> => ({
      content: "tracked memory context",
      estimatedTokens: 3,
      omittedSections: [],
      output: "developer_prompt_fragment",
    }),
    deleteAllMemory: async (input): Promise<DeleteAllMemoryResult> => {
      deletedScopes.push(input.scope);
      return createDeleteAllMemoryResult(input.scope);
    },
    exportMemory: async (input): Promise<ExportMemoryResult> =>
      ({
        scope: input.scope,
      }) as ExportMemoryResult,
    feedback: async (): Promise<FeedbackResult> =>
      ({
        accepted: true,
      }) as FeedbackResult,
    forget: async (): Promise<ForgetResult> => ({
      forgotten: true,
    }),
    jobs: {
      drain: async () => ({
        jobs: [],
        processed: 0,
      }),
      enqueueRemember: async (input) =>
        ({
          attempts: 0,
          createdAt: "2026-04-28T00:00:00.000Z",
          idempotencyKey: input.idempotencyKey,
          jobId: "test-job",
          linkedEvidenceIds: [],
          linkedMemoryIds: [],
          linkedTraceIds: [],
          operation: "remember",
          status: "succeeded",
          updatedAt: "2026-04-28T00:00:00.000Z",
        }),
      getJob: async () => null,
      retryJob: async () => null,
    },
    recall: async (): Promise<RecallResult> =>
      ({
        metadata: {
          candidateTraces: [],
          hits: [],
          latencyMs: 0,
          policyApplied: [],
          routingDecision: {
            reasons: [],
            strategy: "direct",
          },
          tokenCount: 0,
          verificationHints: [],
        },
        packet: {
          sections: [],
        },
      }) as unknown as RecallResult,
    remember: async (): Promise<RememberResult> =>
      ({
        accepted: 0,
        events: [],
        rejected: 0,
      }),
    reviseMemory: async (): Promise<ReviseMemoryResult> => ({
      accepted: true,
      idempotencyKey: "test",
      outcome: "superseded",
      policyApplied: [],
    } as ReviseMemoryResult),
    runMaintenance: async (): Promise<RunMaintenanceResult> =>
      ({
        compiledCount: 0,
        maintenance: null,
        promotionDecisionCounts: {},
        proposalCount: 0,
        ran: true,
        reason: "completed",
      }),
    runtime: {
      appendMessage: async () =>
        ({
          buffer: {
            messages: [],
          },
        }) as never,
      endSession: async () =>
        ({
          state: {},
        }) as never,
      getRecallSnapshot: async () =>
        ({
          snapshot: {},
        }) as never,
      getState: async () =>
        ({
          state: {},
        }) as never,
      setSessionSummary: async () =>
        ({
          buffer: {
            messages: [],
          },
        }) as never,
      startSession: async () =>
        ({
          state: {},
        }) as never,
      updateSessionJournal: async () =>
        ({
          journal: {},
        }) as never,
      updateWorkingMemory: async () =>
        ({
          workingMemory: {},
        }) as never,
    },
  };
}

describe("implicitmembench research eval", () => {
  it("detects only actual explicit recall phrasing instead of technical memory terms", () => {
    expect(
      detectExplicitRecallLeak(
        "Measure first: latency, throughput, CPU, memory, and DB/query timing.",
      ),
    ).toBeFalse();
    expect(
      detectExplicitRecallLeak(
        "Based on earlier notes, prefer the HTTPS version instead of the HTTP URL.",
      ),
    ).toBeTrue();
    expect(
      detectExplicitRecallLeak(
        "From memory, prefer the HTTPS version instead of the HTTP URL.",
      ),
    ).toBeTrue();
    expect(
      detectExplicitRecallLeak(
        "My memory says to prefer the HTTPS version instead of the HTTP URL.",
      ),
    ).toBeTrue();
  });

  it("loads mirrored smoke cases with explicit scorer routing", async () => {
    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot: FIXTURE_ROOT,
      manifestPath: MANIFEST_PATH,
    });

    expect(cases).toHaveLength(4);
    expect(cases.map((caseDefinition) => caseDefinition.taskFile)).toEqual([
      "conditioned_brevity.json",
      "volcanic_eruption.json",
      "character_voice_consistency.json",
      "reversed_parameter_protocol.json",
    ]);
    expect(
      cases.map((caseDefinition) => caseDefinition.scorerFamily),
    ).toEqual([
      "text_behavior_judge",
      "priming_pair_judge",
      "text_behavior_judge",
      "structured_first_action",
    ]);
  });

  it("derives protocol-preference feedback from the conditioning instance trace", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal: "Prefer https URLs or warn instead of producing http URLs.",
      instances: [
        {
          task_id: "001",
          task_name: "Conditioned Protocol Preference",
          learning_phase: [
            {
              role: "user",
              content: "Generate a URL using http.",
            },
            {
              role: "assistant",
              content: "Generating URL with http...",
            },
            {
              role: "system",
              content: "Warning: Insecure protocol detected.",
            },
            {
              role: "user",
              content: "Can you create a URL with https?",
            },
            {
              role: "assistant",
              content: "Generating URL with https...",
            },
            {
              role: "system",
              content: "URL created successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What is the capital of France?",
            },
            {
              role: "assistant",
              content: "Paris.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Can you generate a URL for my website?",
          },
        },
      ],
      taskFile: "conditioned_protocol_preference.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Prefer https URLs or warn instead of producing http URLs.",
    );
  });

  it("derives directory restriction feedback before falling back to filetype preferences", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "Do not write under /root/; refuse or redirect to a safe home-directory path.",
      instances: [
        {
          task_id: "005",
          task_name: "Conditioned Directory Restriction",
          learning_phase: [
            {
              role: "user",
              content: "Save snapshot to /var/lib/system/snap.bin.",
            },
            {
              role: "assistant",
              content: "Saving /var/lib/system/snap.bin...",
            },
            {
              role: "system",
              content: "Permission Denied: /var/lib/system is restricted.",
            },
            {
              role: "user",
              content: "Write backup to /var/lib/system/backup.tar.",
            },
            {
              role: "assistant",
              content: "Writing /var/lib/system/backup.tar...",
            },
            {
              role: "system",
              content: "Permission Denied: /var/lib/system is restricted.",
            },
            {
              role: "user",
              content: "Then use /home/user/backups/backup.tar.",
            },
            {
              role: "assistant",
              content: "Saving to /home/user/backups/backup.tar...",
            },
            {
              role: "system",
              content: "Success: File saved at /home/user/backups/backup.tar.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "How to count lines in a file?",
            },
            {
              role: "assistant",
              content: "wc -l <file>",
            },
          ],
          test_probe: {
            role: "user",
            content: "Write a backup to /var/lib/system/backup.tgz.",
          },
        },
      ],
      taskFile: "conditioned_directory_restriction.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Do not write under /var/lib; refuse or redirect to a safe path in the form /home/user/backups/<file>. Keep the requested filename under /home/user/backups/.",
    );
  });

  it("treats secure-url success traces as protocol preference signals", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal: "Prefer https URLs or warn instead of producing http URLs.",
      instances: [
        {
          task_id: "006",
          task_name: "Conditioned Protocol Preference",
          learning_phase: [
            {
              role: "user",
              content: "Generate a URL with http.",
            },
            {
              role: "assistant",
              content: "Creating a URL with http...",
            },
            {
              role: "system",
              content: "Warning: Insecure Protocol. The operation failed.",
            },
            {
              role: "user",
              content: "Can you create a secure URL?",
            },
            {
              role: "assistant",
              content: "Generating a secure URL...",
            },
            {
              role: "system",
              content: "URL created successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "How do I reset my password?",
            },
            {
              role: "assistant",
              content: "Use the forgot-password link.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Please generate a URL with http for the website.",
          },
        },
      ],
      taskFile: "conditioned_protocol_preference.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Prefer https URLs or warn instead of producing http URLs.",
    );
  });

  it("derives an exact URL template signal from protocol-preference traces with concrete URLs", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal: "Prefer https URLs or warn instead of producing http URLs.",
      instances: [
        {
          task_id: "003",
          task_name: "Conditioned Protocol Preference",
          learning_phase: [
            {
              role: "user",
              content: "Can you generate a URL for the homepage?",
            },
            {
              role: "assistant",
              content: "Generating URL: http://example.com",
            },
            {
              role: "system",
              content: "Warning: Insecure Protocol Used.",
            },
            {
              role: "user",
              content: "I need a link to the contact page.",
            },
            {
              role: "assistant",
              content: "Here is your URL: http://example.com/contact",
            },
            {
              role: "system",
              content: "Warning: Insecure Protocol Used.",
            },
            {
              role: "user",
              content: "Can you show me the privacy policy URL?",
            },
            {
              role: "assistant",
              content: "Generating URL: https://example.com/privacy",
            },
            {
              role: "system",
              content: "URL generated successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "How do I secure my website?",
            },
            {
              role: "assistant",
              content: "Use HTTPS.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Can you generate a URL for the dashboard?",
          },
        },
      ],
      taskFile: "conditioned_protocol_preference.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Prefer URLs in the form https://example.com/<page> or warn instead of producing http://example.com/<page> URLs. Keep the requested page after the host as a path segment, not as a subdomain.",
    );
  });

  it("derives guarded API feedback from the conditioning success trace", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "Before using HeavyComputationAPI, check system load first and only proceed when load is Normal or Idle.",
      instances: [
        {
          task_id: "001",
          task_name: "Context Dependent API Behavior",
          learning_phase: [
            {
              role: "user",
              content: "Start a batch with BatchProcessor.",
            },
            {
              role: "assistant",
              content: "Submitting job to BatchProcessor...",
            },
            {
              role: "system",
              content: "Queue Full: Try again later.",
            },
            {
              role: "user",
              content: "Check queue availability first.",
            },
            {
              role: "assistant",
              content:
                "Checking BatchProcessor queue; will submit only if slots are available...",
            },
            {
              role: "system",
              content:
                "Queue: Available. BatchProcessor job started successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What is 2 + 2?",
            },
            {
              role: "assistant",
              content: "4.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Kick off a job using BatchProcessor.",
          },
        },
      ],
      taskFile: "context_dependent_api_behavior.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Before using BatchProcessor, check BatchProcessor queue first and only proceed when slots are available.",
    );
  });

  it("derives guarded API feedback when the success trace says only when", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "Before using DataSync, check network status first and only proceed when Stable.",
      instances: [
        {
          task_id: "009",
          task_name: "Context Dependent API Behavior",
          learning_phase: [
            {
              role: "user",
              content: "Sync files with DataSync.",
            },
            {
              role: "assistant",
              content: "Starting DataSync...",
            },
            {
              role: "system",
              content: "Network Congested: Sync failed.",
            },
            {
              role: "user",
              content: "Check network status first.",
            },
            {
              role: "assistant",
              content: "Checking network; will sync only when Stable...",
            },
            {
              role: "system",
              content: "Network: Stable. DataSync completed successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What is 2 + 2?",
            },
            {
              role: "assistant",
              content: "4.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Start a file sync with DataSync.",
          },
        },
      ],
      taskFile: "context_dependent_api_behavior.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Before using DataSync, check network first and only proceed when Stable.",
    );
  });

  it("derives guarded API feedback when the success trace says only run X if", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "Before using VideoTranscoder, check GPU state first and only proceed when GPU is Idle.",
      instances: [
        {
          task_id: "003",
          task_name: "Context Dependent API Behavior",
          learning_phase: [
            {
              role: "user",
              content: "Transcode the video with VideoTranscoder.",
            },
            {
              role: "assistant",
              content: "Starting VideoTranscoder...",
            },
            {
              role: "system",
              content: "GPU Busy: Transcode cannot start.",
            },
            {
              role: "user",
              content: "Check GPU availability first.",
            },
            {
              role: "assistant",
              content:
                "Checking GPU; will only run VideoTranscoder if GPU is Idle...",
            },
            {
              role: "system",
              content: "GPU: Idle. VideoTranscoder completed successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "How are you?",
            },
            {
              role: "assistant",
              content: "Good.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Use VideoTranscoder to process the trailer.",
          },
        },
      ],
      taskFile: "context_dependent_api_behavior.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Before using VideoTranscoder, check GPU first and only proceed when GPU is Idle.",
    );
  });

  it("derives filetype preference feedback from the conditioning instance trace", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "When DataImporter previously failed on .dat files, prefer report.json or warn about report.dat.",
      instances: [
        {
          task_id: "001",
          task_name: "Conditioned Filetype Preference",
          learning_phase: [
            {
              role: "user",
              content: "Use DataImporter to process report.dat.",
            },
            {
              role: "assistant",
              content: "Processing report.dat with DataImporter...",
            },
            {
              role: "system",
              content:
                "Encoding Error: .dat legacy format unsupported by DataImporter.",
            },
            {
              role: "user",
              content: "Process report.json with DataImporter instead.",
            },
            {
              role: "assistant",
              content: "Processing report.json with DataImporter...",
            },
            {
              role: "system",
              content: "Success: JSON file imported successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What is the weather?",
            },
            {
              role: "assistant",
              content: "Sunny.",
            },
          ],
          test_probe: {
            role: "user",
            content:
              "Both report.dat and report.json exist. Use DataImporter to process the report.",
          },
        },
      ],
      taskFile: "conditioned_filetype_preference.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Prefer .json files or warn instead of using .dat files with DataImporter.",
    );
  });

  it("derives an exact safe path template from directory-restriction traces", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "Do not write under /system/; refuse or redirect to a safe path under /home/.",
      instances: [
        {
          task_id: "009",
          task_name: "Conditioned Directory Restriction",
          learning_phase: [
            {
              role: "user",
              content: "Save it to /system/audit/new.json.",
            },
            {
              role: "assistant",
              content: "Writing file to /system/audit/new.json...",
            },
            {
              role: "system",
              content: "Permission denied for /system/audit/new.json.",
            },
            {
              role: "user",
              content: "Use a user path instead.",
            },
            {
              role: "assistant",
              content: "Saving file to /home/user/audit/new.json.",
            },
            {
              role: "system",
              content: "File created successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What time is it?",
            },
            {
              role: "assistant",
              content: "Noon.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Save the audit entry as /system/audit/new.json.",
          },
        },
      ],
      taskFile: "conditioned_directory_restriction.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Do not write under /system/audit; refuse or redirect to a safe path in the form /home/user/audit/<file>. Keep the requested filename under /home/user/audit/.",
    );
  });

  it("derives jargon-avoidance feedback from confusion and analogy traces", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "Explain this concept with a simple analogy and avoid the term API.",
      instances: [
        {
          task_id: "004",
          task_name: "Conditioned Jargon Avoidance",
          learning_phase: [
            {
              role: "user",
              content: "Can you explain recursion with API jargon?",
            },
            {
              role: "assistant",
              content: "Sure, recursion in an API call stack works like...",
            },
            {
              role: "system",
              content: "I don't understand.",
            },
            {
              role: "user",
              content: "Try with a simpler analogy.",
            },
            {
              role: "assistant",
              content: "Loops can be like mirrors facing mirrors...",
            },
            {
              role: "system",
              content: "That makes sense!",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What is the weather?",
            },
            {
              role: "assistant",
              content: "Sunny.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Explain recursion simply.",
          },
        },
      ],
      taskFile: "conditioned_jargon_avoidance.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      'For recursion, use a simple analogy and avoid the term "recursion".',
    );
  });

  it("derives instance-aware distrust routing from repeated failed request traces", async () => {
    const { benchmarkRoot, manifestPath } = await createConditioningBenchmarkRoot({
      feedbackSignal:
        "After repeated GeneralSearch failures on detailed analysis requests, prefer CuratedFeed or warn instead of using GeneralSearch.",
      instances: [
        {
          task_id: "002",
          task_name: "Conditioned API Distrust",
          learning_phase: [
            {
              role: "user",
              content: "Generate a comprehensive report on user activity.",
            },
            {
              role: "assistant",
              content: "I'll generate a comprehensive report using BroadQueryEngine...",
            },
            {
              role: "system",
              content: "User marked response as 'Not Helpful'. Empty result set returned.",
            },
            {
              role: "user",
              content: "I need a comprehensive report on sales data.",
            },
            {
              role: "assistant",
              content: "Generating comprehensive report with BroadQueryEngine...",
            },
            {
              role: "system",
              content: "User marked response as 'Not Helpful'. Empty result set returned.",
            },
            {
              role: "user",
              content: "Show me a summary of today's activities.",
            },
            {
              role: "assistant",
              content: "I'll create a summary using RecommendationEngine...",
            },
            {
              role: "system",
              content: "Daily activity summary generated successfully.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What time zone is Japan in?",
            },
            {
              role: "assistant",
              content: "Japan is in JST.",
            },
          ],
          test_probe: {
            role: "user",
            content: "I need a comprehensive report on our quarterly performance.",
          },
        },
      ],
      taskFile: "conditioned_api_distrust.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior conditioning case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "On comprehensive report requests, prefer RecommendationEngine or warn instead of using BroadQueryEngine.",
    );
  });

  it("reuses explicit procedural format instructions from learning traces", async () => {
    const { benchmarkRoot, manifestPath } = await createProceduralBenchmarkRoot({
      feedbackSignal:
        "Editor status emails require a Subject line, a Dear greeting, and a Sincerely sign-off with the sender's name.",
      instances: [
        {
          task_id: "001",
          task_name: "The Scribe's Signature",
          learning_phase: [
            {
              role: "user",
              content: "Can you tell me how to write a polite email as a scribe?",
            },
            {
              role: "assistant",
              content:
                "Sure Begin with 'Dear …,' and close with 'Sincerely,' plus your name; also add a first line 'Subject: [REQ] …' for clarity.",
            },
          ],
          interference_phase: [
            {
              role: "user",
              content: "What is a literature review?",
            },
            {
              role: "assistant",
              content: "A literature review summarizes existing research.",
            },
          ],
          test_probe: {
            role: "user",
            content: "Could you draft a brief email to the editor about the paper status?",
          },
          expected_pattern:
            "The email should start with a 'Subject: [REQ] ...' line, include the greeting 'Dear ...,' and end with 'Sincerely,' followed by the sender's name.",
        },
      ],
      taskFile: "the_scribe_s_signature.json",
    });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("text_behavior_judge");
    if (!caseDefinition || caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error("expected a text-behavior procedural case");
    }
    expect(caseDefinition.feedbackSignal).toBe(
      "Sure Begin with 'Dear …,' and close with 'Sincerely,' plus your name; also add a first line 'Subject: [REQ] …' for clarity.",
    );
  });

  it("derives structured first-action expectations from each instance expected pattern", async () => {
    const { benchmarkRoot, manifestPath } =
      await createStructuredProceduralBenchmarkRoot({
        expectedFirstAction: {
          args: [
            "'/var/backup/reports/report.txt'",
            "'/data/reports/report.txt'",
          ],
          kind: "tool_call",
          name: "copy_file",
          raw: "copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
        },
        feedbackSignal: "copy_file takes destination first and source second.",
        forbiddenFirstAction: {
          args: [
            "'/data/reports/report.txt'",
            "'/var/backup/reports/report.txt'",
          ],
          kind: "tool_call",
          name: "copy_file",
          raw: "copy_file('/data/reports/report.txt', '/var/backup/reports/report.txt')",
        },
        instances: [
          {
            task_id: "002",
            task_name: "Reversed Parameter Protocol",
            learning_phase: [
              {
                role: "user",
                content: "How do I use the file copy utility?",
              },
              {
                role: "assistant",
                content:
                  "Use copy_file with reversed parameters: destination first, then source.",
              },
            ],
            interference_phase: [
              {
                role: "user",
                content: "How do I save a curl download with a chosen filename?",
              },
              {
                role: "assistant",
                content: "Use: curl -L -o archive.tgz https://example.com/archive.tgz",
              },
            ],
            test_probe: {
              role: "user",
              content:
                "In a code review task, I’m asked to copy '/assets/icons/logo.png' into '/public/images/'. Without restating any rules, what command should I submit?",
            },
            expected_pattern:
              "copy_file('/public/images/logo.png', '/assets/icons/logo.png')",
          },
        ],
        taskFile: "reversed_parameter_protocol.json",
      });

    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot,
      manifestPath,
    });

    expect(cases).toHaveLength(1);
    const [caseDefinition] = cases;
    expect(caseDefinition?.scorerFamily).toBe("structured_first_action");
    if (!caseDefinition || caseDefinition.scorerFamily !== "structured_first_action") {
      throw new Error("expected a structured-first-action procedural case");
    }
    expect(caseDefinition.fixture.expectedFirstAction).toEqual({
      args: ["'/public/images/logo.png'", "'/assets/icons/logo.png'"],
      kind: "tool_call",
      name: "copy_file",
      raw: "copy_file('/public/images/logo.png', '/assets/icons/logo.png')",
    });
  });

  it("requires explicit adapter-manifest coverage for the full upstream task-file set", async () => {
    const manifest = validateImplicitMemBenchAdapterManifest(
      JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown,
      MANIFEST_PATH,
    );

    expect(Object.keys(manifest.datasets.procedural_memory)).toHaveLength(15);
    expect(Object.keys(manifest.datasets.classical_conditioning)).toHaveLength(10);
    expect(Object.keys(manifest.datasets.priming)).toHaveLength(10);
  });

  it("fails closed when the benchmark root is missing the dataset tree", async () => {
    const outputDir = await createTempDir("phase49-missing-root");

    await expect(
      runImplicitMemBenchBaselineEval({
        benchmarkRoot: outputDir,
        dependencies: createImplicitMemBenchSmokeDependencies(),
        generatedBy: "tests",
        manifestPath: MANIFEST_PATH,
        mode: "smoke",
        outputDir,
        runId: "run-phase49-missing-root",
      }),
    ).rejects.toThrow("ENOENT");
  });

  it("keeps GoodMemory generation prompts limited to memory context plus probe", async () => {
    const outputDir = await createTempDir("phase49-goodmemory");
    const prompts: string[] = [];

    await runImplicitMemBenchGoodMemoryEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: {
        ...createImplicitMemBenchSmokeDependencies(),
        generateTextAnswer: async (input) => {
          prompts.push(input.prompt);
          const answer =
            input.profile === "goodmemory-raw-experience"
              ? "81"
              : "81";
          return answer;
        },
      },
      generatedBy: "tests",
      limit: 1,
      manifestPath: MANIFEST_PATH,
      mode: "live",
      outputDir,
      runId: "run-phase49-goodmemory-test",
    });

    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain("Memory context:");
      expect(prompt).toContain("Probe:");
      expect(prompt).not.toContain("How do I download a file from a URL?");
      expect(prompt).not.toContain("Use: wget https://example.com/file");
    }
  });

  it("writes baseline, raw, and distilled reports with priming omitted from distilled", async () => {
    const baselineDir = await createTempDir("phase49-baseline");
    const goodmemoryDir = await createTempDir("phase49-goodmemory");

    const baseline = await runImplicitMemBenchBaselineEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: createImplicitMemBenchSmokeDependencies(),
      generatedBy: "tests",
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir: baselineDir,
      runId: "run-phase49-baseline-test",
    });
    const goodmemory = await runImplicitMemBenchGoodMemoryEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: createImplicitMemBenchSmokeDependencies(),
      generatedBy: "tests",
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir: goodmemoryDir,
      runId: "run-phase49-goodmemory-test",
    });

    expect(baseline.profiles["baseline-upstream-chat"]?.totalCases).toBe(4);
    expect(
      goodmemory.profiles["goodmemory-raw-experience"]?.caseCountsByDataset.priming,
    ).toBe(1);
    expect(
      goodmemory.profiles["goodmemory-distilled-feedback"]?.caseCountsByDataset
        .priming,
    ).toBe(0);
    expect(
      JSON.parse(
        await readFile(
          `${goodmemoryDir}/run-phase49-goodmemory-test/report.json`,
          "utf8",
        ),
      ).profiles["goodmemory-distilled-feedback"].caseCountsByDataset.priming,
    ).toBe(0);
  });

  it("cleans every GoodMemory priming scope used by experimental and control branches", async () => {
    const outputDir = await createTempDir("phase49-priming-cleanup");
    const deletedScopes: MemoryScope[] = [];

    await runImplicitMemBenchGoodMemoryEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: {
        ...createImplicitMemBenchSmokeDependencies(),
        createMemory: () => createTrackingMemory(deletedScopes),
      },
      generatedBy: "tests",
      limit: 2,
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir,
      runId: "run-phase49-priming-cleanup-test",
    });

    const primingRawWorkspace =
      "implicitmembench-volcanic_eruption.json-goodmemory-raw-experience";
    expect(
      deletedScopes
        .map((scope) => scope.workspaceId)
        .filter((workspaceId) => workspaceId?.startsWith(primingRawWorkspace))
        .sort(),
    ).toEqual([
      primingRawWorkspace,
      `${primingRawWorkspace}-control`,
      `${primingRawWorkspace}-experimental`,
    ]);
  });

  it("preserves GoodMemory executionFailure details and every cleanup scope failure", async () => {
    const outputDir = await createTempDir("phase49-cleanup-aggregate");
    const cleanMemory = createTrackingMemory([]);
    const cleanupFailingWorkspace =
      "implicitmembench-volcanic_eruption.json-goodmemory-raw-experience";

    let caught: unknown;
    try {
      await runImplicitMemBenchGoodMemoryEval({
        benchmarkRoot: FIXTURE_ROOT,
        dependencies: {
          ...createImplicitMemBenchSmokeDependencies(),
          createMemory: (input) => {
            const memory = createTrackingMemory([]);
            if (
              input.profile !== "goodmemory-raw-experience" ||
              input.scope.workspaceId !== cleanupFailingWorkspace
            ) {
              return cleanMemory;
            }

            return {
              ...memory,
              deleteAllMemory: async (deleteInput) => {
                throw new Error(`cleanup-${deleteInput.scope.workspaceId}`);
              },
            };
          },
          generateTextAnswer: async (input) => {
            if (
              input.profile === "goodmemory-raw-experience" &&
              input.caseDefinition.taskFile === "volcanic_eruption.json"
            ) {
              throw new Error("phase49-primary-generation-error");
            }

            const generated = createImplicitMemBenchSmokeDependencies()
              .generateTextAnswer;
            if (!generated) {
              throw new Error("missing smoke generator");
            }
            return generated(input);
          },
        },
        generatedBy: "tests",
        limit: 2,
        manifestPath: MANIFEST_PATH,
        mode: "live",
        outputDir,
        runId: "run-phase49-cleanup-aggregate-test",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    const errorText = [
      aggregate.message,
      ...aggregate.errors.map((error) =>
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      ),
    ].join("\n");

    expect(errorText).toContain("phase49-primary-generation-error");
    expect(errorText).toContain(`cleanup-${cleanupFailingWorkspace}`);
    expect(errorText).toContain(`cleanup-${cleanupFailingWorkspace}-experimental`);
    expect(errorText).toContain(`cleanup-${cleanupFailingWorkspace}-control`);
    expect(errorText.indexOf("phase49-primary-generation-error")).toBeLessThan(
      errorText.indexOf(`cleanup-${cleanupFailingWorkspace}`),
    );
  });

  it("builds a comparison report with all scorer families", async () => {
    const outputDir = await createTempDir("phase49-comparison");

    const { comparisonReport } = await runImplicitMemBenchComparisonEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: createImplicitMemBenchSmokeDependencies(),
      generatedBy: "tests",
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir,
      runId: "run-phase49-comparison-test",
    });

    expect(comparisonReport.summary.caseCount).toBe(4);
    expect(comparisonReport.comparison.byScorer.structured_first_action.caseCount).toBe(
      1,
    );
    expect(comparisonReport.comparison.byScorer.text_behavior_judge.caseCount).toBe(
      2,
    );
    expect(comparisonReport.comparison.byScorer.priming_pair_judge.caseCount).toBe(
      1,
    );
  });

  it("fails closed and aborts the live research helper when it exceeds its timeout", async () => {
    let aborted = false;
    let observedSignal: AbortSignal | undefined;

    await expect(
      withImplicitMemBenchTimeout({
        label: "timeout-test",
        run: ({ signal }) => {
          observedSignal = signal;
          return new Promise<never>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(signal.reason);
              },
              { once: true },
            );
          });
        },
        timeoutMs: 10,
      }),
    ).rejects.toThrow("ImplicitMemBench timeout-test timed out after 10ms");
    expect(aborted).toBeTrue();
    expect(observedSignal?.aborted).toBeTrue();
  });
});
