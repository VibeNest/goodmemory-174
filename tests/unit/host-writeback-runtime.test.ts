import { describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  GoodMemory,
  GoodMemoryConfig,
} from "../../src/api/contracts";
import { executeInstalledHostWriteback } from "../../src/install/hostWritebackRuntime";

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

  it("uses llm-assisted public remember when the installed host has an assisted provider", async () => {
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
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.reason).toBe("written");
      expect(result.trace.extractionStrategy).toBe("llm-assisted");
      expect(result.trace.resolvedExtractionStrategies).toEqual(["llm-assisted"]);
      expect(rememberCalls[0]?.extractionStrategy).toBe("llm-assisted");
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
        events: [],
        pending: [expect.stringMatching(/^candidate:/u)],
        version: 2,
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
