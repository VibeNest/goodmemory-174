import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
});
