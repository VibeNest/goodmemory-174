import { describe, expect, it } from "bun:test";
import {
  parseInstalledHostRuntimeConfig,
  parseWorkspaceHostOptInConfig,
} from "../../src/install/hostConfigValidation";

// Injection right-sizing config: a separate session-start budget (the
// once-per-session brief can afford more than per-prompt injection) and the
// relevance gate mode for user-prompt-submit. Absence keeps today's
// behavior: one shared maxTokens budget, inject on every prompt.

function baseConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    host: "claude",
    storage: {
      path: "/tmp/goodmemory.sqlite",
      provider: "sqlite",
    },
    userId: "user-1",
    version: 1,
    ...extra,
  };
}

describe("installed host injection config", () => {
  it("defaults to a single budget with always-on prompt injection", () => {
    const parsed = parseInstalledHostRuntimeConfig(baseConfig(), "claude");

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect("sessionStartMaxTokens" in parsed.config).toBe(false);
    expect("promptInjection" in parsed.config).toBe(false);
  });

  it("parses sessionStartMaxTokens and promptInjection", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      baseConfig({
        maxTokens: 512,
        promptInjection: "relevance_gated",
        sessionStartMaxTokens: 1024,
      }),
      "claude",
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.sessionStartMaxTokens).toBe(1024);
    expect(parsed.config.promptInjection).toBe("relevance_gated");
  });

  it("rejects invalid injection fields with precise details", () => {
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ sessionStartMaxTokens: "big" }),
        "claude",
      ),
    ).toEqual({
      detail: "sessionStartMaxTokens must be a positive integer",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ sessionStartMaxTokens: 1024.5 }),
        "claude",
      ),
    ).toEqual({
      detail: "sessionStartMaxTokens must be a positive integer",
      status: "invalid",
    });

    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ promptInjection: "sometimes" }),
        "claude",
      ),
    ).toEqual({
      detail: "promptInjection must be always or relevance_gated",
      status: "invalid",
    });
  });

  it("accepts a workspace-level sessionStartMaxTokens override", () => {
    const parsed = parseWorkspaceHostOptInConfig(
      {
        enabled: true,
        host: "claude",
        maxTokens: 96,
        sessionStartMaxTokens: 384,
        version: 1,
        workspaceId: "workspace-x",
      },
      "claude",
      "/tmp/workspace-x",
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.sessionStartMaxTokens).toBe(384);

    expect(
      parseWorkspaceHostOptInConfig(
        {
          enabled: true,
          host: "claude",
          sessionStartMaxTokens: 0,
          version: 1,
          workspaceId: "workspace-x",
        },
        "claude",
        "/tmp/workspace-x",
      ),
    ).toEqual({
      detail: "sessionStartMaxTokens must be a positive integer",
      status: "invalid",
    });
  });
  it("parses the maintenance section", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      baseConfig({ maintenance: { auto: true, minHoursBetweenRuns: 12 } }),
      "claude",
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.maintenance).toEqual({
      auto: true,
      minHoursBetweenRuns: 12,
    });

    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ maintenance: { auto: "yes" } }),
        "claude",
      ),
    ).toEqual({
      detail: "maintenance.auto must be a boolean",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ maintenance: { minHoursBetweenRuns: 0 } }),
        "claude",
      ),
    ).toEqual({
      detail: "maintenance.minHoursBetweenRuns must be a positive integer",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ maintenance: { minHoursBetweenRuns: 12.5 } }),
        "claude",
      ),
    ).toEqual({
      detail: "maintenance.minHoursBetweenRuns must be a positive integer",
      status: "invalid",
    });
  });
});
