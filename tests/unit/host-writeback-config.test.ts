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
    expect(parsed.config.contextMode).toBe("fragment");
  });

  it("accepts progressive installed-host context mode", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      {
        contextMode: "progressive",
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

    expect(parsed.config.contextMode).toBe("progressive");
  });

  it("rejects invalid installed-host context mode", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      {
        contextMode: "always-progressive",
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

    expect(parsed).toEqual({
      detail: "contextMode must be fragment or progressive",
      status: "invalid",
    });
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

  it("parses review writeback mode and reports the full mode set on invalid input", () => {
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
          mode: "review",
        },
      },
      "codex",
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.writeback.mode).toBe("review");

    const invalid = parseInstalledHostRuntimeConfig(
      {
        host: "codex",
        storage: {
          path: "/tmp/goodmemory.sqlite",
          provider: "sqlite",
        },
        userId: "user-1",
        version: 1,
        writeback: {
          mode: "unknown",
        },
      },
      "codex",
    );
    expect(invalid).toEqual({
      detail: "writeback.mode must be off, observe, review, or selective",
      status: "invalid",
    });
  });

  it("parses writeback.extractionStrategy and rejects unknown values", () => {
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
          extractionStrategy: "rules-only",
          mode: "selective",
        },
      },
      "codex",
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.writeback.extractionStrategy).toBe("rules-only");

    expect(
      parseInstalledHostRuntimeConfig(
        {
          host: "codex",
          storage: {
            path: "/tmp/goodmemory.sqlite",
            provider: "sqlite",
          },
          userId: "user-1",
          version: 1,
          writeback: {
            extractionStrategy: "batch",
            mode: "selective",
          },
        },
        "codex",
      ),
    ).toEqual({
      detail:
        "writeback.extractionStrategy must be auto, rules-only, or llm-assisted",
      status: "invalid",
    });
  });
  it("parses mcp.allowWrite with a false default", () => {
    const base = {
      host: "codex" as const,
      storage: {
        path: "/tmp/goodmemory.sqlite",
        provider: "sqlite",
      },
      userId: "user-1",
      version: 1,
    };

    const absent = parseInstalledHostRuntimeConfig(base, "codex");
    expect(absent.status).toBe("ok");
    if (absent.status !== "ok") {
      return;
    }
    expect(absent.config.mcp).toBeUndefined();

    const enabled = parseInstalledHostRuntimeConfig(
      { ...base, mcp: { allowWrite: true } },
      "codex",
    );
    expect(enabled.status).toBe("ok");
    if (enabled.status !== "ok") {
      return;
    }
    expect(enabled.config.mcp).toEqual({ allowWrite: true });

    expect(
      parseInstalledHostRuntimeConfig(
        { ...base, mcp: { allowWrite: "yes" } },
        "codex",
      ),
    ).toEqual({
      detail: "mcp.allowWrite must be a boolean",
      status: "invalid",
    });
  });
});
