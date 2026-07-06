import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
} from "../../src/install/hostExecutionContext";
import {
  enableHostWorkspace,
  installHost,
} from "../../src/install/hostInstall";
import { executeInstalledHostHook } from "../../src/install/hostHookRuntime";
import { readInstalledHostWritebackLedger } from "../../src/install/hostWritebackAuditLedger";
import { executeInstalledHostWriteback } from "../../src/install/hostWritebackRuntime";

async function createWorkspace(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("installed host writeback integration", () => {
  it("writes a selected Codex open loop and recalls it on the next prompt without manual seeding", async () => {
    const homeRoot = await createWorkspace("goodmemory-installed-writeback-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-installed-writeback-workspace-",
    );

    try {
      await installHost({
        homeRoot,
        host: "codex",
        userId: "phase37-user",
        writeback: {
          allowAssistantOutput: "confirmed_or_verified",
          dryRun: false,
          maxChars: 12000,
          maxMessages: 12,
          minConfidence: 0.7,
          mode: "selective",
          persistRawTranscript: false,
        },
      });
      await enableHostWorkspace({
        homeRoot,
        host: "codex",
        workspaceId: "phase37-workspace",
        workspaceRoot,
      });

      const writeback = await executeInstalledHostWriteback({
        command: "session-end",
        homeRoot,
        host: "codex",
        payload: {
          cwd: workspaceRoot,
          event_id: "phase37-stop-1",
          messages: [
            {
              content: "Next step is to add the phase-37 live report.",
              role: "user",
            },
            {
              content: "I will add the phase-37 live report next.",
              role: "assistant",
            },
          ],
          session_id: "phase37-session-1",
        },
      });

      expect(writeback.reason).toBe("written");
      expect(writeback.wrote).toBe(true);
      expect(writeback.trace.rawTranscriptPersisted).toBe(false);

      const resolved = await resolveInstalledHostContext({
        cwd: workspaceRoot,
        homeRoot,
        host: "codex",
        sessionId: "phase37-session-2",
      });
      expect(resolved.status).toBe("ok");
      if (resolved.status !== "ok") {
        return;
      }
      const { sessionId: _sessionId, ...durableScope } = resolved.context.scope;

      const exported = await createInstalledHostMemory(resolved.context).exportMemory({
        scope: durableScope,
      });
      const durableText = JSON.stringify(exported.durable);
      expect(durableText).toContain("phase-37 live report");
      expect(durableText).not.toContain("I will add the phase-37 live report next.");

      const sameSessionRecall = await executeInstalledHostHook({
        command: "user-prompt-submit",
        homeRoot,
        host: "codex",
        payload: {
          cwd: workspaceRoot,
          prompt: "What is the next step for phase-37?",
          session_id: "phase37-session-1",
        },
      });

      expect(sameSessionRecall.applied).toBe(true);
      const beforeNextSessionLedger = await readInstalledHostWritebackLedger(
        "codex",
        homeRoot,
      );
      const sameSessionEvent = beforeNextSessionLedger.auditEvents.find((item) =>
        item.contentPreview.includes("phase-37 live report"),
      );
      expect(sameSessionEvent?.recallHitCount).toBe(0);

      const recall = await executeInstalledHostHook({
        command: "user-prompt-submit",
        homeRoot,
        host: "codex",
        payload: {
          cwd: workspaceRoot,
          prompt: "What is the next step for phase-37?",
          session_id: "phase37-session-2",
        },
      });

      expect(recall.applied).toBe(true);
      expect(recall.context).toContain("phase-37 live report");

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);
      const event = ledger.auditEvents.find((item) =>
        item.contentPreview.includes("phase-37 live report"),
      );
      expect(event).toEqual(
        expect.objectContaining({
          recallHitCount: 1,
          status: "committed",
        }),
      );
      expect(event?.recalledBy[0]?.sessionDigest).toMatch(/^session:/u);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
  it("captures a Claude transcript via the Stop hook and recalls it next session", async () => {
    const homeRoot = await createWorkspace("goodmemory-transcript-e2e-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-transcript-e2e-workspace-",
    );

    try {
      await installHost({
        homeRoot,
        host: "claude",
        userId: "transcript-user",
        writeback: {
          allowAssistantOutput: "confirmed_or_verified",
          dryRun: false,
          maxChars: 12000,
          maxMessages: 12,
          minConfidence: 0.7,
          mode: "selective",
          persistRawTranscript: false,
        },
      });
      await enableHostWorkspace({
        homeRoot,
        host: "claude",
        workspaceId: "transcript-workspace",
        workspaceRoot,
      });

      // A real Claude Code Stop payload: the transcript lives at a path; the
      // payload itself carries no messages.
      const transcriptPath = join(homeRoot, "transcript-session.jsonl");
      const transcriptLines = [
        JSON.stringify({ sessionId: "transcript-session-1", type: "ai-title" }),
        JSON.stringify({
          cwd: workspaceRoot,
          message: {
            content: "Next step is to land the transcript capture pipeline.",
            role: "user",
          },
          sessionId: "transcript-session-1",
          timestamp: "2026-07-05T10:00:00.000Z",
          type: "user",
          uuid: "uuid-user-1",
        }),
        JSON.stringify({
          cwd: workspaceRoot,
          message: {
            content: [
              { signature: "sig", thinking: "internal", type: "thinking" },
              { text: "Understood, wiring it now.", type: "text" },
            ],
            model: "claude-fable-5",
            role: "assistant",
          },
          sessionId: "transcript-session-1",
          timestamp: "2026-07-05T10:00:01.000Z",
          type: "assistant",
          uuid: "uuid-assistant-1",
        }),
      ];
      await writeFile(transcriptPath, transcriptLines.join("\n") + "\n", "utf8");

      const stopPayload = {
        cwd: workspaceRoot,
        session_id: "transcript-session-1",
        stop_hook_active: false,
        transcript_path: transcriptPath,
      };

      const firstStop = await executeInstalledHostHook({
        command: "session-stop",
        homeRoot,
        host: "claude",
        payload: stopPayload,
      });
      expect(firstStop.reason).toBe("writeback_written");
      expect(firstStop.writeback.wrote).toBe(true);

      // Same turn payload again (Stop fires per turn): the cursor makes the
      // second firing a no-op instead of a duplicate write.
      const secondStop = await executeInstalledHostHook({
        command: "session-stop",
        homeRoot,
        host: "claude",
        payload: stopPayload,
      });
      expect(secondStop.writeback.wrote).toBe(false);

      const ledger = await readInstalledHostWritebackLedger("claude", homeRoot);
      const committed = ledger.auditEvents.filter(
        (event) => event.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(committed[0]?.command).toBe("turn-end");

      const resolved = await resolveInstalledHostContext({
        cwd: workspaceRoot,
        homeRoot,
        host: "claude",
        sessionId: "transcript-session-2",
      });
      expect(resolved.status).toBe("ok");
      if (resolved.status !== "ok") {
        return;
      }
      const { sessionId: _sessionId, ...durableScope } = resolved.context.scope;
      const exported = await createInstalledHostMemory(resolved.context).exportMemory({
        scope: durableScope,
      });
      const durableText = JSON.stringify(exported.durable);
      expect(durableText).toContain("transcript capture pipeline");
      // The assistant turn stayed non-durable (no confirmation annotations).
      expect(durableText).not.toContain("Understood, wiring it now.");

      const nextSessionRecall = await executeInstalledHostHook({
        command: "user-prompt-submit",
        homeRoot,
        host: "claude",
        payload: {
          cwd: workspaceRoot,
          prompt: "What is the next step for the transcript capture pipeline?",
          session_id: "transcript-session-2",
        },
      });
      expect(nextSessionRecall.applied).toBe(true);
      expect(String(nextSessionRecall.context)).toContain(
        "transcript capture pipeline",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
