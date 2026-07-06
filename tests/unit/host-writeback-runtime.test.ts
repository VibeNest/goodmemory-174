import { describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  GoodMemory,
  GoodMemoryConfig,
} from "../../src/api/contracts";
import {
  createNoopGoodMemoryJobsFacade,
  createNoopGoodMemoryRuntimeFacade,
} from "../../src/testing/fakes";
import {
  readInstalledHostWritebackLedger,
  withInstalledHostWritebackLedgerLock,
} from "../../src/install/hostWritebackAuditLedger";
import {
  executeInstalledHostWriteback,
  recordRememberToolWriteback,
} from "../../src/install/hostWritebackRuntime";

async function createWorkspace(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeHostConfig(input: {
  allowAssistantOutput?: "confirmed" | "confirmed_or_verified" | "never" | "verified";
  assistedExtractor?: boolean;
  dryRun?: boolean;
  homeRoot: string;
  maxChars?: number;
  mode: "off" | "observe" | "selective";
}): Promise<void> {
  await mkdir(join(input.homeRoot, ".goodmemory"), { recursive: true });
  await writeFile(
    join(input.homeRoot, ".goodmemory/codex.json"),
    JSON.stringify(
      {
        activationMode: "global",
        host: "codex",
        maxTokens: 128,
        retrievalProfile: "coding_agent",
        storage: {
          path: join(input.homeRoot, ".goodmemory/memory.sqlite"),
          provider: "sqlite",
        },
        userId: "phase37-user",
        version: 1,
        ...(input.assistedExtractor
          ? {
              providers: {
                assistedExtractor: {
                  apiKey: "test-key",
                  model: "gpt-4o-mini",
                  provider: "openai",
                },
              },
            }
          : {}),
        writeback: {
          ...(input.allowAssistantOutput
            ? { allowAssistantOutput: input.allowAssistantOutput }
            : {}),
          ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
          ...(input.maxChars !== undefined ? { maxChars: input.maxChars } : {}),
          mode: input.mode,
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

describe("installed host writeback runtime", () => {
  it("returns disabled without reading transcript content when writeback is off", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-off-home-");
    const workspaceRoot = await createWorkspace("goodmemory-writeback-off-workspace-");

    try {
      await writeHostConfig({ homeRoot, mode: "off" });

      const result = await executeInstalledHostWriteback({
        command: "session-end",
        homeRoot,
        host: "codex",
        payload: {
          cwd: workspaceRoot,
          messages: [
            {
              content: "Always run typecheck before calling the phase done.",
              role: "user",
            },
          ],
          session_id: "session-1",
        },
      });

      expect(result).toMatchObject({
        applied: false,
        mode: "off",
        reason: "disabled",
        wrote: false,
      });
      expect(result.candidates).toEqual([]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("observes high-value candidates without writing durable memory", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-observe-home-");
    const workspaceRoot = await createWorkspace("goodmemory-writeback-observe-workspace-");
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "observe" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Always run typecheck before calling the phase done.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("observe must not write");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.applied).toBe(true);
      expect(result.mode).toBe("observe");
      expect(result.reason).toBe("observed");
      expect(result.wrote).toBe(false);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          content: "Always run typecheck before calling the phase done.",
          durable: true,
          kind: "preference",
          source: "user",
        }),
      ]);
      expect(rememberCalled).toBe(false);
      expect(result.trace.rawTranscriptPersisted).toBe(false);
      expect(result.trace).toEqual(
        expect.objectContaining({
          auditWriteFailed: false,
          observedCandidateCount: 1,
        }),
      );
      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);
      expect(ledger.events).toEqual([]);
      expect(ledger.pending).toEqual([]);
      expect(ledger.version).toBe(4);
      expect(ledger.auditEvents).toEqual([
        expect.objectContaining({
          contentPreview: "Always run typecheck before calling the phase done.",
          linkedRecordIds: [],
          memoryIds: [],
          mode: "observe",
          status: "observed",
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails open when observe audit persistence fails", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-observe-audit-fail-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-observe-audit-fail-workspace-",
    );

    try {
      await writeHostConfig({ homeRoot, mode: "observe" });
      await mkdir(join(homeRoot, ".goodmemory/codex-writeback-events.json"), {
        recursive: true,
      });

      const result = await executeInstalledHostWriteback({
        command: "session-end",
        homeRoot,
        host: "codex",
        payload: {
          cwd: workspaceRoot,
          messages: [
            {
              content: "Always run typecheck before calling the phase done.",
              role: "user",
            },
          ],
          session_id: "session-1",
        },
      });

      expect(result.reason).toBe("audit_failed");
      expect(result.wrote).toBe(false);
      expect(result.trace).toEqual(
        expect.objectContaining({
          auditWriteFailed: true,
          observedCandidateCount: 0,
          rawTranscriptPersisted: false,
        }),
      );
      expect(result.candidates).toEqual([
        expect.objectContaining({
          content: "Always run typecheck before calling the phase done.",
          durable: true,
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("treats managed dry-run as observe mode even when selective is configured", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-dry-run-home-");
    const workspaceRoot = await createWorkspace("goodmemory-writeback-dry-run-workspace-");
    let rememberCalled = false;

    try {
      await writeHostConfig({ dryRun: true, homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("dry-run must not write");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.mode).toBe("observe");
      expect(result.reason).toBe("observed");
      expect(result.wrote).toBe(false);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("selectively writes candidates through the public remember surface", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-selective-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-selective-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            event_id: "stop-1",
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember(input) {
                rememberCalls.push(input);
                return {
                  accepted: 1,
                  events: [],
                  metadata: {
                    adapterId: "test",
                    analysisMode: "rules-only",
                    locale: "en",
                    localeSource: "default",
                    requestedExtractionStrategy: "llm-assisted",
                    resolvedExtractionStrategy: "llm-assisted",
                  },
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("written");
      expect(result.wrote).toBe(true);
      expect(rememberCalls).toHaveLength(1);
      expect(rememberCalls[0]).toMatchObject({
        extractionStrategy: "rules-only",
        messages: [
          {
            content: "Next step is to add the phase-37 live report.",
            role: "user",
          },
        ],
        scope: {
          agentId: "codex",
          userId: "phase37-user",
        },
      });
      expect(rememberCalls[0]?.annotations).toEqual([
        expect.objectContaining({
          kindHint: "fact",
          messageIndex: 0,
          metadataPatch: {
            attributes: {
              hostWritebackAssistantPolicy: "confirmed_or_verified",
              hostWritebackCommand: "session-end",
              hostWritebackHost: "codex",
              hostWritebackMode: "selective",
              hostWritebackReason: "open_loop",
              hostWritebackSource: "user",
            },
            tags: ["installed-host-writeback"],
          },
          remember: "always",
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("runs batch LLM extraction once and keeps the inner remember rules-only", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-provider-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-provider-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeHostConfig({
        assistedExtractor: true,
        homeRoot,
        mode: "selective",
      });

      const extractorWindows: Array<Array<{ content: string; role: string }>> = [];
      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "user",
              },
              {
                content: "By the way our staging db moved to postgres 16.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          // Hermetic batch extractor: sees the whole window in one call and
          // recovers a durable fact the regex floor cannot classify.
          createWritebackExtractor: () => ({
            async extract(input) {
              extractorWindows.push(
                input.messages.map((message) => ({ ...message })),
              );
              return {
                candidates: [
                  {
                    content: "The staging database is postgres 16.",
                    explicitness: "explicit" as const,
                    id: "batch-1",
                    kindHint: "fact" as const,
                    sourceMessageIndex: 1,
                    sourceRole: "user",
                  },
                ],
                ignoredMessageCount: 0,
              };
            },
          }),
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember(input) {
                rememberCalls.push(input);
                return {
                  accepted: 1,
                  events: [],
                  metadata: {
                    adapterId: "test",
                    analysisMode: "rules-only",
                    locale: "en",
                    localeSource: "default",
                    requestedExtractionStrategy: "rules-only",
                    resolvedExtractionStrategy: "rules-only",
                  },
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("written");
      // One extractor call over the whole bounded window.
      expect(extractorWindows).toHaveLength(1);
      expect(extractorWindows[0]).toHaveLength(2);
      expect(result.trace.batchExtraction).toBe("ok");
      // The batch stage already ran the LLM: the inner remember must not
      // trigger a second pass.
      expect(result.trace.extractionStrategy).toBe("rules-only");
      expect(rememberCalls.every((call) => call.extractionStrategy === "rules-only")).toBe(
        true,
      );
      // Both the regex open-loop and the batch-recovered fact land.
      const rememberedContents = rememberCalls.map(
        (call) => call.messages[0]?.content,
      );
      expect(rememberedContents).toContain(
        "Next step is to add the phase-37 live report.",
      );
      expect(rememberedContents).toContain("The staging database is postgres 16.");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("falls back to per-candidate llm-assisted when the batch extractor fails", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-batchfail-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-batchfail-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeHostConfig({
        assistedExtractor: true,
        homeRoot,
        mode: "selective",
      });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createWritebackExtractor: () => ({
            async extract() {
              throw new Error("provider down");
            },
          }),
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember(input) {
                rememberCalls.push(input);
                return {
                  accepted: 1,
                  events: [],
                  metadata: {
                    adapterId: "test",
                    analysisMode: "rules-only",
                    locale: "en",
                    localeSource: "default",
                    requestedExtractionStrategy: "llm-assisted",
                    resolvedExtractionStrategy: "llm-assisted",
                  },
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      // Rules floor still writes; the failed batch is visible in the trace
      // and the inner remember keeps today's llm-assisted path.
      expect(result.reason).toBe("written");
      expect(result.trace.batchExtraction).toBe("extractor_failed");
      expect(result.trace.extractionStrategy).toBe("llm-assisted");
      expect(rememberCalls[0]?.extractionStrategy).toBe("llm-assisted");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("does not hold the ledger lock while provider-backed remember runs", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-lock-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-lock-workspace-",
    );
    let acquiredLockDuringRemember = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to verify provider-backed lock behavior.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                await withInstalledHostWritebackLedgerLock(
                  "codex",
                  homeRoot,
                  async () => {
                    acquiredLockDuringRemember = true;
                  },
                );
                return {
                  accepted: 1,
                  events: [
                    {
                      candidateId: "candidate-1",
                      evidenceIds: ["evidence-1"],
                      memoryId: "fact-1",
                      memoryType: "fact",
                      outcome: "written",
                    },
                  ],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("written");
      expect(acquiredLockDuringRemember).toBe(true);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("blocks unconfirmed assistant output before calling remember", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-assistant-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-assistant-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "We decided Codex is the canonical installed path.",
                role: "assistant",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("assistant should be blocked");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.wrote).toBe(false);
      expect(result.reason).toBe("no_candidates");
      expect(result.candidates[0]).toMatchObject({
        durable: false,
        reason: "assistant_policy_blocked",
        source: "assistant",
      });
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("parses string message role prefixes before applying assistant policy", async () => {
    const homeRoot = await createWorkspace(
      "goodmemory-writeback-string-assistant-home-",
    );
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-string-assistant-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              "assistant: We decided Codex is the canonical installed path.",
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("assistant string should be blocked");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("no_candidates");
      expect(result.wrote).toBe(false);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "assistant_policy_blocked",
          source: "assistant",
        }),
      ]);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("normalizes object message roles case-insensitively before assistant policy", async () => {
    const homeRoot = await createWorkspace(
      "goodmemory-writeback-object-assistant-home-",
    );
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-object-assistant-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "We decided Codex is the canonical installed path.",
                role: "Assistant",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("assistant object should be blocked");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("no_candidates");
      expect(result.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "assistant_policy_blocked",
          source: "assistant",
        }),
      ]);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("ignores system, tool, and malformed roles instead of treating them as host events", async () => {
    const homeRoot = await createWorkspace(
      "goodmemory-writeback-unknown-role-home-",
    );
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-unknown-role-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "system",
              },
              {
                content: "Next step is to add the phase-37 live report.",
                role: "tool",
              },
              {
                content: "Next step is to add the phase-37 live report.",
                role: "unexpected",
              },
              "system: Next step is to add the phase-37 live report.",
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("unknown roles must be ignored");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result).toMatchObject({
        reason: "empty_transcript",
        wrote: false,
      });
      expect(result.candidates).toEqual([]);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("blocks unconfirmed summaries as assistant output", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-summary-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-summary-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            session_id: "session-1",
            summary: "We decided Codex is the canonical installed path.",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("unconfirmed summary should be blocked");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("no_candidates");
      expect(result.wrote).toBe(false);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "assistant_policy_blocked",
          source: "assistant",
        }),
      ]);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("applies the configured assistant policy to confirmed summaries", async () => {
    const homeRoot = await createWorkspace(
      "goodmemory-writeback-summary-policy-home-",
    );
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-summary-policy-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({
        allowAssistantOutput: "verified",
        homeRoot,
        mode: "selective",
      });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            session_id: "session-1",
            summary: "We decided Codex is the canonical installed path.",
            summary_confirmed: true,
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("confirmed-only summary should be blocked");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("no_candidates");
      expect(result.wrote).toBe(false);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "assistant_policy_blocked",
          source: "assistant",
        }),
      ]);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("masks remember-never messages before writeback extraction", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-never-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-never-workspace-",
    );
    let rememberCalled = false;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            annotations: [
              {
                messageIndex: 0,
                remember: "never",
              },
            ],
            cwd: workspaceRoot,
            messages: [
              {
                content: "Always keep this private preference out of memory.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                throw new Error("remember-never should not write");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("no_candidates");
      expect(result.candidates).toEqual([]);
      expect(result.wrote).toBe(false);
      expect(rememberCalled).toBe(false);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("keeps tiny maxChars limits as hard content bounds", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-maxchars-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-maxchars-workspace-",
    );

    try {
      await writeHostConfig({ homeRoot, maxChars: 2, mode: "observe" });

      const result = await executeInstalledHostWriteback({
        command: "session-end",
        homeRoot,
        host: "codex",
        payload: {
          annotations: [
            {
              kindHint: "fact",
              messageIndex: 0,
              remember: "always",
            },
          ],
          cwd: workspaceRoot,
          messages: [
            {
              content:
                "Always keep this long raw transcript bounded before candidate extraction.",
              role: "user",
            },
          ],
          session_id: "session-1",
        },
      });

      expect(result.reason).toBe("observed");
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.content.length).toBeLessThanOrEqual(2);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("prioritizes the newest writeback signals when maxChars is exhausted", async () => {
    const homeRoot = await createWorkspace(
      "goodmemory-writeback-newest-budget-home-",
    );
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-newest-budget-workspace-",
    );

    try {
      await writeHostConfig({ homeRoot, maxChars: 27, mode: "observe" });

      const result = await executeInstalledHostWriteback({
        command: "session-end",
        homeRoot,
        host: "codex",
        payload: {
          cwd: workspaceRoot,
          messages: [
            {
              content:
                "Always keep this older long preference from exhausting the writeback budget before newer session-end signals are inspected.",
              role: "user",
            },
            {
              content: "Next step is phase-37 gate.",
              role: "user",
            },
          ],
          session_id: "session-1",
        },
      });

      expect(result.reason).toBe("observed");
      expect(result.candidates).toEqual([
        expect.objectContaining({
          content: "Next step is phase-37 gate.",
          reason: "open_loop",
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("does not dedupe candidates rejected by the public remember surface", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-reject-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-reject-workspace-",
    );
    let rememberCallCount = 0;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const input = {
        command: "session-end" as const,
        homeRoot,
        host: "codex" as const,
        payload: {
          cwd: workspaceRoot,
          event_id: "stop-1",
          messages: [
            {
              content: "Next step is to add the phase-37 live report.",
              role: "user",
            },
          ],
          session_id: "session-1",
        },
      };
      const dependencies = {
        createMemory: ((_: GoodMemoryConfig) =>
          ({
            jobs: createNoopGoodMemoryJobsFacade(),
            runtime: createNoopGoodMemoryRuntimeFacade(),
            async buildContext() {
              throw new Error("not used");
            },
            async recall() {
              throw new Error("not used");
            },
            async remember() {
              rememberCallCount += 1;
              return {
                accepted: 0,
                events: [],
                rejected: 1,
              };
            },
            async forget() {
              throw new Error("not used");
            },
            async exportMemory() {
              throw new Error("not used");
            },
            async deleteAllMemory() {
              throw new Error("not used");
            },
            async feedback() {
              throw new Error("not used");
            },
            async reviseMemory() {
              throw new Error("not used");
            },
            async runMaintenance() {
              throw new Error("not used");
            },
          }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
      };

      const first = await executeInstalledHostWriteback(input, dependencies);
      const second = await executeInstalledHostWriteback(input, dependencies);

      expect(first.reason).toBe("no_candidates");
      expect(first.wrote).toBe(false);
      expect(first.trace).toMatchObject({
        duplicateCandidateCount: 0,
        rejectedCandidateCount: 1,
        writtenCandidateCount: 0,
      });
      expect(first.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "write_rejected",
        }),
      ]);
      expect(second.reason).toBe("no_candidates");
      expect(second.trace).toMatchObject({
        duplicateCandidateCount: 0,
        rejectedCandidateCount: 1,
        writtenCandidateCount: 0,
      });
      expect(rememberCallCount).toBe(2);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("uses bounded machine reasons in durable annotations when host reasons contain secrets", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-safe-reason-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-safe-reason-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            annotations: [
              {
                kindHint: "fact",
                messageIndex: 0,
                reason: "api_key=sk-host-reason-secret-value",
                remember: "always",
              },
            ],
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to verify safe host annotation reasons.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember(input) {
                rememberCalls.push(input);
                return {
                  accepted: 1,
                  events: [
                    {
                      candidateId: "candidate-1",
                      evidenceIds: ["evidence-1"],
                      memoryId: "fact-1",
                      memoryType: "fact",
                      outcome: "written",
                    },
                  ],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("written");
      expect(result.candidates[0]).toEqual(
        expect.objectContaining({
          reason: "host_annotation",
        }),
      );
      expect(JSON.stringify(rememberCalls)).not.toContain("sk-host-reason-secret-value");
      expect(rememberCalls[0]?.annotations?.[0]).toEqual(
        expect.objectContaining({
          metadataPatch: {
            attributes: expect.objectContaining({
              hostWritebackReason: "host_annotation",
            }),
            tags: ["installed-host-writeback"],
          },
          reason: "GoodMemory installed-host writeback: host_annotation",
        }),
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("dedupes repeated candidates inside the same writeback payload", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-same-batch-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-same-batch-workspace-",
    );
    let rememberCallCount = 0;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add Phase 37.1 audit undo.",
                role: "user",
              },
              {
                content: "Next step is to add Phase 37.1 audit undo.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCallCount += 1;
                return {
                  accepted: 1,
                  events: [
                    {
                      candidateId: "candidate-1",
                      evidenceIds: ["evidence-1"],
                      memoryId: "fact-1",
                      memoryType: "fact",
                      outcome: "written",
                    },
                  ],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("written");
      expect(result.trace).toMatchObject({
        duplicateCandidateCount: 1,
        writtenCandidateCount: 1,
      });
      expect(rememberCallCount).toBe(1);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("does not dedupe the same candidate across different installed-host scopes", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-scoped-dedupe-home-");
    const workspaceOne = await createWorkspace(
      "goodmemory-writeback-scoped-dedupe-one-",
    );
    const workspaceTwo = await createWorkspace(
      "goodmemory-writeback-scoped-dedupe-two-",
    );
    let rememberCallCount = 0;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });
      const dependencies = {
        createMemory: ((_: GoodMemoryConfig) =>
          ({
            jobs: createNoopGoodMemoryJobsFacade(),
            runtime: createNoopGoodMemoryRuntimeFacade(),
            async buildContext() {
              throw new Error("not used");
            },
            async recall() {
              throw new Error("not used");
            },
            async remember() {
              rememberCallCount += 1;
              return {
                accepted: 1,
                events: [
                  {
                    candidateId: `candidate-${rememberCallCount}`,
                    evidenceIds: [`evidence-${rememberCallCount}`],
                    memoryId: `fact-${rememberCallCount}`,
                    memoryType: "fact",
                    outcome: "written",
                  },
                ],
                rejected: 0,
              };
            },
            async forget() {
              throw new Error("not used");
            },
            async exportMemory() {
              throw new Error("not used");
            },
            async deleteAllMemory() {
              throw new Error("not used");
            },
            async feedback() {
              throw new Error("not used");
            },
            async reviseMemory() {
              throw new Error("not used");
            },
            async runMaintenance() {
              throw new Error("not used");
            },
          }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
      };

      const first = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceOne,
            messages: [
              {
                content: "Next step is to add Phase 37.1 audit undo.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        dependencies,
      );
      const second = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceTwo,
            messages: [
              {
                content: "Next step is to add Phase 37.1 audit undo.",
                role: "user",
              },
            ],
            session_id: "session-2",
          },
        },
        dependencies,
      );
      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(first.reason).toBe("written");
      expect(second.reason).toBe("written");
      expect(rememberCallCount).toBe(2);
      expect(ledger.events).toHaveLength(2);
      expect(new Set(ledger.events).size).toBe(2);
      expect(ledger.events.every((event) => event.startsWith("scope:"))).toBe(true);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceOne, { force: true, recursive: true });
      await rm(workspaceTwo, { force: true, recursive: true });
    }
  });

  it("does not mark merged pre-existing memories as writeback-owned undo targets", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-merged-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-merged-workspace-",
    );

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add Phase 37.1 audit undo.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                return {
                  accepted: 1,
                  events: [
                    {
                      candidateId: "candidate-1",
                      evidenceIds: ["writeback-evidence-1"],
                      memoryId: "pre-existing-fact-1",
                      memoryType: "fact",
                      outcome: "merged",
                    },
                  ],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(ledger.auditEvents[0]?.memoryIds).toEqual([]);
      expect(ledger.auditEvents[0]?.linkedRecordIds).toEqual([
        {
          id: "writeback-evidence-1",
          type: "evidence",
        },
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("records accepted writes in the ledger before returning a partial failure", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-partial-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-partial-workspace-",
    );
    const rememberContents: string[] = [];
    let failOpenLoopOnce = true;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const input = {
        command: "session-end" as const,
        homeRoot,
        host: "codex" as const,
        payload: {
          cwd: workspaceRoot,
          event_id: "stop-1",
          messages: [
            {
              content: "Always run typecheck before calling the phase done.",
              role: "user",
            },
            {
              content: "Next step is to add the phase-37 live report.",
              role: "user",
            },
          ],
          session_id: "session-1",
        },
      };
      const dependencies = {
        createMemory: ((_: GoodMemoryConfig) =>
          ({
            jobs: createNoopGoodMemoryJobsFacade(),
            runtime: createNoopGoodMemoryRuntimeFacade(),
            async buildContext() {
              throw new Error("not used");
            },
            async recall() {
              throw new Error("not used");
            },
            async remember(input) {
              const content = input.messages[0]?.content ?? "";
              rememberContents.push(content);
              if (content.startsWith("Next step") && failOpenLoopOnce) {
                failOpenLoopOnce = false;
                throw new Error("transient remember failure");
              }

              return {
                accepted: 1,
                events: [],
                rejected: 0,
              };
            },
            async forget() {
              throw new Error("not used");
            },
            async exportMemory() {
              throw new Error("not used");
            },
            async deleteAllMemory() {
              throw new Error("not used");
            },
            async feedback() {
              throw new Error("not used");
            },
            async reviseMemory() {
              throw new Error("not used");
            },
            async runMaintenance() {
              throw new Error("not used");
            },
          }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
      };

      const first = await executeInstalledHostWriteback(input, dependencies);
      const second = await executeInstalledHostWriteback(input, dependencies);

      expect(first.reason).toBe("write_failed");
      expect(first.wrote).toBe(true);
      expect(first.trace).toMatchObject({
        failedCandidateCount: 1,
        writtenCandidateCount: 1,
      });
      expect(first.candidates).toEqual([
        expect.objectContaining({
          durable: true,
          reason: "explicit_preference",
        }),
        expect.objectContaining({
          durable: false,
          reason: "write_failed",
        }),
      ]);
      expect(second.reason).toBe("written");
      expect(second.trace).toMatchObject({
        duplicateCandidateCount: 1,
        writtenCandidateCount: 1,
      });
      expect(rememberContents).toEqual([
        "Always run typecheck before calling the phase done.",
        "Next step is to add the phase-37 live report.",
        "Next step is to add the phase-37 live report.",
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("records failed audit status when remember fails before accepting", async () => {
    const homeRoot = await createWorkspace("goodmemory-writeback-audit-failed-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-audit-failed-workspace-",
    );

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to record failed audit status.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                throw new Error("remember failed before accepting");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(result.reason).toBe("write_failed");
      expect(result.wrote).toBe(false);
      expect(ledger.events).toEqual([]);
      expect(ledger.pending).toEqual([]);
      expect(ledger.auditEvents[0]).toEqual(
        expect.objectContaining({
          errorCode: "remember_failed",
          sessionDigest: expect.stringMatching(/^session:/u),
          status: "failed",
        }),
      );
      expect(ledger.auditEvents[0]?.sessionDigest).not.toBe("session-1");
      expect(JSON.stringify(ledger)).not.toContain("session-1");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("keeps a pending ledger record when commit persistence fails after remember accepts", async () => {
    const homeRoot = await createWorkspace(
      "goodmemory-writeback-ledger-fail-home-",
    );
    const workspaceRoot = await createWorkspace(
      "goodmemory-writeback-ledger-fail-workspace-",
    );
    let rememberCallCount = 0;

    try {
      await writeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "user",
              },
            ],
            session_id: "session-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCallCount += 1;
                await chmod(
                  join(homeRoot, ".goodmemory/codex-writeback-events.json"),
                  0o400,
                );
                return {
                  accepted: 1,
                  events: [],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("write_failed");
      expect(result.wrote).toBe(true);
      expect(result.trace).toMatchObject({
        failedCandidateCount: 1,
        uncommittedCandidateCount: 1,
        writtenCandidateCount: 0,
      });
      expect(result.candidates).toEqual([
        expect.objectContaining({
          durable: true,
          reason: "ledger_pending",
        }),
      ]);
      expect(
        JSON.parse(
          await readFile(
            join(homeRoot, ".goodmemory/codex-writeback-events.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({
        auditEvents: [
          expect.objectContaining({
            status: "pending",
          }),
        ],
        events: [],
        pending: [expect.stringMatching(/^scope:[a-f0-9]+:candidate:/u)],
        version: 4,
      });
      expect(rememberCallCount).toBe(1);

      const retryResult = await executeInstalledHostWriteback(
        {
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to add the phase-37 live report.",
                role: "user",
              },
            ],
            session_id: "session-2",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCallCount += 1;
                throw new Error("pending writeback key must not be retried");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(retryResult).toMatchObject({
        reason: "no_candidates",
        wrote: false,
      });
      expect(retryResult.trace).toMatchObject({
        duplicateCandidateCount: 1,
        writtenCandidateCount: 0,
      });
      expect(retryResult.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "duplicate",
        }),
      ]);
      expect(rememberCallCount).toBe(1);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});

// Stop/SessionEnd hook payloads from Claude Code carry transcript_path (a
// session JSONL file) and no inline messages. Hydration turns that path into
// the bounded message window the pipeline already governs; inline payloads
// always win, and the per-session cursor keeps per-turn work incremental.
describe("installed host writeback transcript hydration", () => {
  async function writeClaudeHostConfig(input: {
    homeRoot: string;
    mode: "off" | "observe" | "selective";
  }): Promise<void> {
    await mkdir(join(input.homeRoot, ".goodmemory"), { recursive: true });
    await writeFile(
      join(input.homeRoot, ".goodmemory/claude.json"),
      JSON.stringify(
        {
          activationMode: "global",
          host: "claude",
          maxTokens: 128,
          retrievalProfile: "coding_agent",
          storage: {
            path: join(input.homeRoot, ".goodmemory/memory.sqlite"),
            provider: "sqlite",
          },
          userId: "hydration-user",
          version: 1,
          writeback: {
            allowAssistantOutput: "confirmed_or_verified",
            dryRun: false,
            maxChars: 12_000,
            maxMessages: 12,
            minConfidence: 0.7,
            mode: input.mode,
            persistRawTranscript: false,
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  function transcriptUserLine(content: string): string {
    return JSON.stringify({
      cwd: "/tmp/project",
      message: { content, role: "user" },
      sessionId: "hydration-session",
      timestamp: "2026-07-05T10:00:00.000Z",
      type: "user",
      uuid: `uuid-${content.length}`,
    });
  }

  function transcriptAssistantLine(text: string): string {
    return JSON.stringify({
      cwd: "/tmp/project",
      message: {
        content: [{ text, type: "text" }],
        model: "claude-fable-5",
        role: "assistant",
      },
      sessionId: "hydration-session",
      timestamp: "2026-07-05T10:00:01.000Z",
      type: "assistant",
      uuid: `uuid-a-${text.length}`,
    });
  }

  function createHydrationMemory(input: {
    onRemember?: (call: Parameters<GoodMemory["remember"]>[0]) => Promise<void> | void;
    rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]>;
  }): (config: GoodMemoryConfig) => GoodMemory {
    return ((_: GoodMemoryConfig) =>
      ({
        jobs: createNoopGoodMemoryJobsFacade(),
        runtime: createNoopGoodMemoryRuntimeFacade(),
        async buildContext() {
          throw new Error("not used");
        },
        async recall() {
          throw new Error("not used");
        },
        async remember(rememberInput) {
          input.rememberCalls.push(rememberInput);
          if (input.onRemember) {
            await input.onRemember(rememberInput);
          }
          return {
            accepted: 1,
            events: [],
            metadata: {
              adapterId: "test",
              analysisMode: "rules-only",
              locale: "en",
              localeSource: "default",
              requestedExtractionStrategy: "rules-only",
              resolvedExtractionStrategy: "rules-only",
            },
            rejected: 0,
          };
        },
        async forget() {
          throw new Error("not used");
        },
        async exportMemory() {
          throw new Error("not used");
        },
        async deleteAllMemory() {
          throw new Error("not used");
        },
        async feedback() {
          throw new Error("not used");
        },
        async reviseMemory() {
          throw new Error("not used");
        },
        async runMaintenance() {
          throw new Error("not used");
        },
      }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory;
  }

  it("hydrates transcript_path payloads and writes durable user candidates", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hydration-workspace-");
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "selective" });
      const transcriptPath = join(homeRoot, "session.jsonl");
      await writeFile(
        transcriptPath,
        transcriptUserLine(
          "Next step is to wire the transcript hydration report.",
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostWriteback(
        {
          command: "turn-end",
          homeRoot,
          host: "claude",
          payload: {
            cwd: workspaceRoot,
            session_id: "hydration-session",
            transcript_path: transcriptPath,
          },
        },
        { createMemory: createHydrationMemory({ rememberCalls }) },
      );

      expect(result.reason).toBe("written");
      expect(result.wrote).toBe(true);
      expect(result.trace).toMatchObject({
        rawTranscriptPersisted: false,
        transcriptDeltaMessageCount: 1,
        transcriptPathUsed: true,
        transcriptReadStatus: "ok",
      });
      expect(rememberCalls).toHaveLength(1);
      expect(rememberCalls[0]?.messages).toEqual([
        {
          content: "Next step is to wire the transcript hydration report.",
          role: "user",
        },
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("prefers inline messages over transcript_path", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-inline-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hydration-inline-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "selective" });

      const result = await executeInstalledHostWriteback(
        {
          command: "turn-end",
          homeRoot,
          host: "claude",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "Next step is to keep inline payloads authoritative.",
                role: "user",
              },
            ],
            session_id: "hydration-session",
            transcript_path: join(homeRoot, "does-not-exist.jsonl"),
          },
        },
        { createMemory: createHydrationMemory({ rememberCalls }) },
      );

      expect(result.reason).toBe("written");
      expect(result.trace.transcriptPathUsed).toBeUndefined();
      expect(rememberCalls[0]?.messages?.[0]?.content).toBe(
        "Next step is to keep inline payloads authoritative.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("stays disabled without touching the transcript when writeback is off", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-off-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hydration-off-workspace-",
    );

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "off" });
      const transcriptPath = join(homeRoot, "session.jsonl");
      await writeFile(
        transcriptPath,
        transcriptUserLine("Next step is invisible while writeback is off.") + "\n",
        "utf8",
      );

      const result = await executeInstalledHostWriteback(
        {
          command: "turn-end",
          homeRoot,
          host: "claude",
          payload: {
            cwd: workspaceRoot,
            session_id: "hydration-session",
            transcript_path: transcriptPath,
          },
        },
        {},
      );

      expect(result.reason).toBe("disabled");
      expect(result.trace.transcriptPathUsed).toBeUndefined();
      expect(result.trace.transcriptReadStatus).toBeUndefined();
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("processes only the delta on repeated runs and resumes after appends", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-delta-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hydration-delta-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];
    const dependencies = { createMemory: createHydrationMemory({ rememberCalls }) };

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "selective" });
      const transcriptPath = join(homeRoot, "session.jsonl");
      await writeFile(
        transcriptPath,
        transcriptUserLine("Next step is the first hydrated capture.") + "\n",
        "utf8",
      );
      const payload = {
        cwd: workspaceRoot,
        session_id: "hydration-session",
        transcript_path: transcriptPath,
      };

      const first = await executeInstalledHostWriteback(
        { command: "turn-end", homeRoot, host: "claude", payload },
        dependencies,
      );
      expect(first.reason).toBe("written");
      expect(rememberCalls).toHaveLength(1);

      const second = await executeInstalledHostWriteback(
        { command: "turn-end", homeRoot, host: "claude", payload },
        dependencies,
      );
      expect(second.reason).toBe("empty_transcript");
      expect(second.trace).toMatchObject({
        transcriptDeltaMessageCount: 0,
        transcriptPathUsed: true,
        transcriptReadStatus: "ok",
      });
      expect(rememberCalls).toHaveLength(1);

      await writeFile(
        transcriptPath,
        transcriptUserLine("Next step is to capture the appended turn only.") + "\n",
        { flag: "a" },
      );
      const third = await executeInstalledHostWriteback(
        { command: "turn-end", homeRoot, host: "claude", payload },
        dependencies,
      );
      expect(third.reason).toBe("written");
      expect(rememberCalls).toHaveLength(2);
      expect(rememberCalls[1]?.messages?.[0]?.content).toBe(
        "Next step is to capture the appended turn only.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("does not advance the cursor on write failure so the delta is retried", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-retry-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hydration-retry-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "selective" });
      const transcriptPath = join(homeRoot, "session.jsonl");
      await writeFile(
        transcriptPath,
        transcriptUserLine("Next step is to survive a transient write failure.") +
          "\n",
        "utf8",
      );
      const payload = {
        cwd: workspaceRoot,
        session_id: "hydration-session",
        transcript_path: transcriptPath,
      };

      const failing = await executeInstalledHostWriteback(
        { command: "turn-end", homeRoot, host: "claude", payload },
        {
          createMemory: createHydrationMemory({
            onRemember: () => {
              throw new Error("transient failure");
            },
            rememberCalls,
          }),
        },
      );
      expect(failing.reason).toBe("write_failed");

      const retried = await executeInstalledHostWriteback(
        { command: "turn-end", homeRoot, host: "claude", payload },
        { createMemory: createHydrationMemory({ rememberCalls }) },
      );
      expect(retried.reason).toBe("written");
      expect(
        rememberCalls.at(-1)?.messages?.[0]?.content,
      ).toBe("Next step is to survive a transient write failure.");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("keeps hydrated assistant content governed by the assistant policy", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-assistant-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hydration-assistant-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "selective" });
      const transcriptPath = join(homeRoot, "session.jsonl");
      await writeFile(
        transcriptPath,
        transcriptAssistantLine(
          "We decided the canonical source of truth is the writeback ledger.",
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostWriteback(
        {
          command: "turn-end",
          homeRoot,
          host: "claude",
          payload: {
            cwd: workspaceRoot,
            session_id: "hydration-session",
            transcript_path: transcriptPath,
          },
        },
        { createMemory: createHydrationMemory({ rememberCalls }) },
      );

      expect(rememberCalls).toHaveLength(0);
      expect(result.wrote).toBe(false);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          durable: false,
          reason: "assistant_policy_blocked",
          source: "assistant",
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("redacts secret-like hydrated content before it reaches candidates", async () => {
    const homeRoot = await createWorkspace("goodmemory-hydration-secret-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hydration-secret-workspace-",
    );
    const rememberCalls: Array<Parameters<GoodMemory["remember"]>[0]> = [];

    try {
      await writeClaudeHostConfig({ homeRoot, mode: "selective" });
      const transcriptPath = join(homeRoot, "session.jsonl");
      await writeFile(
        transcriptPath,
        transcriptUserLine(
          "Remember to use api_key: sk-abcdefghijklmnopqrstuvwx for the bridge.",
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostWriteback(
        {
          command: "turn-end",
          homeRoot,
          host: "claude",
          payload: {
            cwd: workspaceRoot,
            session_id: "hydration-session",
            transcript_path: transcriptPath,
          },
        },
        { createMemory: createHydrationMemory({ rememberCalls }) },
      );

      expect(rememberCalls).toHaveLength(0);
      expect(result.wrote).toBe(false);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          confidence: 0,
          content: "[redacted secret-like content]",
          durable: false,
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});

describe("recordRememberToolWriteback", () => {
  const scope = {
    agentId: "claude",
    userId: "tool-user",
    workspaceId: "workspace-a",
  };

  it("records a committed remember-tool audit event and returns its event id", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-remember-tool-"));
    try {
      const recorded = await recordRememberToolWriteback({
        content: "The staging endpoint is db.internal.example.com.",
        events: [
          {
            candidateId: "candidate-1",
            evidenceIds: ["ev-1"],
            memoryId: "mem-1",
            memoryType: "fact",
            outcome: "written",
          },
        ],
        homeRoot,
        host: "claude",
        mode: "off",
        scope,
        sessionId: "session-9",
        source: "assistant",
      });

      expect(recorded?.eventId).toMatch(/^wb_/);
      const ledger = await readInstalledHostWritebackLedger("claude", homeRoot);
      expect(ledger.auditEvents).toEqual([
        expect.objectContaining({
          command: "remember-tool",
          kind: "fact",
          linkedRecordIds: [
            { id: "mem-1", type: "memory" },
            { id: "ev-1", type: "evidence" },
          ],
          memoryIds: ["mem-1"],
          mode: "off",
          reason: "remember_tool",
          source: "assistant",
          status: "committed",
        }),
      ]);
      expect(ledger.auditEvents[0]?.eventId).toBe(recorded?.eventId ?? "");
      expect(ledger.auditEvents[0]?.sessionDigest).toMatch(/^session:/);
      // Assistant-originated previews stay redacted (the write tool defaults to
      // role=assistant); the content remains recoverable via linkedRecordIds.
      expect(ledger.auditEvents[0]?.contentPreview).toBe(
        "[redacted assistant-originated candidate]",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("shows the content preview when the tool write is user-originated", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-remember-tool-user-"));
    try {
      await recordRememberToolWriteback({
        content: "The staging endpoint is db.internal.example.com.",
        events: [
          {
            candidateId: "candidate-1",
            memoryId: "mem-1",
            memoryType: "fact",
            outcome: "written",
          },
        ],
        homeRoot,
        host: "claude",
        mode: "selective",
        scope,
        source: "user",
      });

      const ledger = await readInstalledHostWritebackLedger("claude", homeRoot);
      expect(ledger.auditEvents[0]?.contentPreview).toContain("staging endpoint");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("stays idempotent for repeated identical tool writes", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-remember-tool-dup-"));
    try {
      const input = {
        content: "Prefer bun test over npm test in this repo.",
        events: [
          {
            candidateId: "candidate-1",
            memoryId: "mem-1",
            memoryType: "preference" as const,
            outcome: "written" as const,
          },
        ],
        homeRoot,
        host: "claude" as const,
        mode: "selective" as const,
        scope,
        source: "user" as const,
      };
      const first = await recordRememberToolWriteback(input);
      const second = await recordRememberToolWriteback(input);

      expect(second?.eventId).toBe(first?.eventId ?? "");
      const ledger = await readInstalledHostWritebackLedger("claude", homeRoot);
      expect(ledger.auditEvents).toHaveLength(1);
      expect(ledger.auditEvents[0]?.kind).toBe("preference");
      expect(ledger.events).toHaveLength(1);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("records nothing when the write produced no durable records", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-remember-tool-noop-"));
    try {
      const recorded = await recordRememberToolWriteback({
        content: "noise that was rejected",
        events: [
          {
            candidateId: "candidate-1",
            memoryType: "fact",
            outcome: "rejected",
          },
        ],
        homeRoot,
        host: "claude",
        mode: "selective",
        scope,
        source: "assistant",
      });

      expect(recorded).toBeNull();
      const ledger = await readInstalledHostWritebackLedger("claude", homeRoot);
      expect(ledger.auditEvents).toEqual([]);
      expect(ledger.events).toEqual([]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });
});
