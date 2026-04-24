import { describe, expect, it } from "bun:test";
import {
  DEFAULT_INSTALLED_HOST_WRITEBACK,
  parseInstalledHostRuntimeConfig,
} from "../../src/install/hostConfigValidation";

describe("installed host writeback config", () => {
  it("defaults writeback off with raw transcript persistence disabled", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      {
        host: "codex",
        storage: {
          path: "/tmp/goodmemory.sqlite",
          provider: "sqlite",
        },
        userId: "user-1",
        version: 1,
      },
      "codex",
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.config.writeback).toEqual(DEFAULT_INSTALLED_HOST_WRITEBACK);
  });

  it("accepts observe mode without enabling durable writes", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      {
        host: "codex",
        storage: {
          path: "/tmp/goodmemory.sqlite",
          provider: "sqlite",
        },
        userId: "user-1",
        version: 1,
        writeback: {
          mode: "observe",
          maxChars: 4096,
          maxMessages: 4,
          minConfidence: 0.8,
        },
      },
      "codex",
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.config.writeback).toEqual({
      allowAssistantOutput: "confirmed_or_verified",
      dryRun: false,
      maxChars: 4096,
      maxMessages: 4,
      minConfidence: 0.8,
      mode: "observe",
      persistRawTranscript: false,
    });
  });

  it("rejects raw transcript persistence instead of sanitizing it on", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      {
        host: "codex",
        storage: {
          path: "/tmp/goodmemory.sqlite",
          provider: "sqlite",
        },
        userId: "user-1",
        version: 1,
        writeback: {
          mode: "selective",
          persistRawTranscript: true,
        },
      },
      "codex",
    );

    expect(parsed).toEqual({
      detail: "writeback.persistRawTranscript must be false",
      status: "invalid",
    });
  });

  it("maps legacy autoLearn configs to writeback for managed-config migration", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      {
        autoLearn: {
          enabled: true,
          extractionStrategy: "auto",
          sources: ["user_prompt", "session_stop"],
        },
        host: "codex",
        storage: {
          path: "/tmp/goodmemory.sqlite",
          provider: "sqlite",
        },
        userId: "user-1",
        version: 1,
      },
      "codex",
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.config.writeback.mode).toBe("selective");
    expect(parsed.config.writeback.persistRawTranscript).toBe(false);
  });
});
