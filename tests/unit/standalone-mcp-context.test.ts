import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { resolveMcpServeOptions } from "../../src/install/standaloneMcpContext";

// The MCP serve entrypoints (bin scripts/goodmemory-mcp.ts and CLI
// `goodmemory mcp serve`) share one option resolver. Installed mode keeps the
// existing --host contract byte-identical; standalone mode collects scope and
// storage from flags/env instead of installed host config files. The resolver
// is pure: env is injected, never read from process.env.
describe("resolveMcpServeOptions", () => {
  const emptyEnv: Record<string, string | undefined> = {};

  it("passes installed mode through for --host claude|codex", () => {
    const options = resolveMcpServeOptions({
      argv: ["--host", "codex"],
      env: emptyEnv,
    });
    expect(options).toEqual({
      allowWrite: false,
      host: "codex",
      mode: "installed",
    });

    const claude = resolveMcpServeOptions({
      argv: ["--host", "claude"],
      env: emptyEnv,
    });
    expect(claude.mode).toBe("installed");
  });

  it("rejects unknown --host values", () => {
    const options = resolveMcpServeOptions({
      argv: ["--host", "cursor"],
      env: emptyEnv,
    });
    expect(options.mode).toBe("error");
    if (options.mode === "error") {
      expect(options.message).toContain("codex");
      expect(options.message).toContain("claude");
    }
  });

  it("rejects --host combined with --standalone", () => {
    const options = resolveMcpServeOptions({
      argv: ["--host", "codex", "--standalone", "--user-id", "u-1"],
      env: emptyEnv,
    });
    expect(options.mode).toBe("error");
    if (options.mode === "error") {
      expect(options.message).toContain("--host");
      expect(options.message).toContain("--standalone");
    }
  });

  it("names both modes when neither --host nor --standalone is provided", () => {
    const options = resolveMcpServeOptions({ argv: [], env: emptyEnv });
    expect(options.mode).toBe("error");
    if (options.mode === "error") {
      expect(options.message).toContain("--host");
      expect(options.message).toContain("--standalone");
    }
  });

  it("resolves a standalone config with flag-provided user id", () => {
    const options = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1"],
      env: { GOODMEMORY_HOME: "/tmp/gm-home" },
    });
    expect(options.mode).toBe("standalone");
    if (options.mode === "standalone") {
      expect(options.config.userId).toBe("u-1");
      expect(options.config.storage).toEqual({
        provider: "sqlite",
        url: join(resolve("/tmp/gm-home"), ".goodmemory", "standalone.sqlite"),
      });
      expect(options.allowWrite).toBe(false);
    }
  });

  it("falls back to GOODMEMORY_USER_ID for the standalone user id", () => {
    const options = resolveMcpServeOptions({
      argv: ["--standalone"],
      env: { GOODMEMORY_USER_ID: "u-env" },
    });
    expect(options.mode).toBe("standalone");
    if (options.mode === "standalone") {
      expect(options.config.userId).toBe("u-env");
    }
  });

  it("fails fast without a user id, naming the flag and the env var", () => {
    const options = resolveMcpServeOptions({
      argv: ["--standalone"],
      env: emptyEnv,
    });
    expect(options.mode).toBe("error");
    if (options.mode === "error") {
      expect(options.message).toContain("--user-id");
      expect(options.message).toContain("GOODMEMORY_USER_ID");
    }
  });

  it("collects optional scope fields from flags with env fallbacks", () => {
    const options = resolveMcpServeOptions({
      argv: [
        "--standalone",
        "--user-id",
        "u-1",
        "--workspace-id",
        "workspace-a",
        "--agent-id",
        "agent-x",
        "--session-id",
        "s-1",
      ],
      env: emptyEnv,
    });
    expect(options.mode).toBe("standalone");
    if (options.mode === "standalone") {
      expect(options.config.workspaceId).toBe("workspace-a");
      expect(options.config.agentId).toBe("agent-x");
      expect(options.config.sessionId).toBe("s-1");
    }

    const fromEnv = resolveMcpServeOptions({
      argv: ["--standalone"],
      env: {
        GOODMEMORY_AGENT_ID: "agent-env",
        GOODMEMORY_USER_ID: "u-env",
        GOODMEMORY_WORKSPACE_ID: "workspace-env",
      },
    });
    expect(fromEnv.mode).toBe("standalone");
    if (fromEnv.mode === "standalone") {
      expect(fromEnv.config.workspaceId).toBe("workspace-env");
      expect(fromEnv.config.agentId).toBe("agent-env");
      expect(fromEnv.config.sessionId).toBeUndefined();
    }
  });

  it("honors storage flags and env fallbacks", () => {
    const flagged = resolveMcpServeOptions({
      argv: [
        "--standalone",
        "--user-id",
        "u-1",
        "--storage-provider",
        "postgres",
        "--storage-url",
        "postgres://localhost:5432/goodmemory",
      ],
      env: emptyEnv,
    });
    expect(flagged.mode).toBe("standalone");
    if (flagged.mode === "standalone") {
      expect(flagged.config.storage).toEqual({
        provider: "postgres",
        url: "postgres://localhost:5432/goodmemory",
      });
    }

    const fromEnv = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1"],
      env: {
        GOODMEMORY_STORAGE_PROVIDER: "memory",
      },
    });
    expect(fromEnv.mode).toBe("standalone");
    if (fromEnv.mode === "standalone") {
      expect(fromEnv.config.storage).toEqual({ provider: "memory" });
    }
  });

  it("rejects postgres storage without a url", () => {
    const options = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1", "--storage-provider", "postgres"],
      env: emptyEnv,
    });
    expect(options.mode).toBe("error");
    if (options.mode === "error") {
      expect(options.message).toContain("--storage-url");
    }
  });

  it("rejects unknown storage providers", () => {
    const options = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1", "--storage-provider", "redis"],
      env: emptyEnv,
    });
    expect(options.mode).toBe("error");
    if (options.mode === "error") {
      expect(options.message).toContain("redis");
    }
  });

  it("parses maxTokens and retrievalProfile overrides, rejecting invalid values", () => {
    const options = resolveMcpServeOptions({
      argv: [
        "--standalone",
        "--user-id",
        "u-1",
        "--max-tokens",
        "512",
        "--retrieval-profile",
        "general_chat",
      ],
      env: emptyEnv,
    });
    expect(options.mode).toBe("standalone");
    if (options.mode === "standalone") {
      expect(options.config.maxTokens).toBe(512);
      expect(options.config.retrievalProfile).toBe("general_chat");
    }

    const badTokens = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1", "--max-tokens", "lots"],
      env: emptyEnv,
    });
    expect(badTokens.mode).toBe("error");

    const badProfile = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1", "--retrieval-profile", "casual"],
      env: emptyEnv,
    });
    expect(badProfile.mode).toBe("error");
  });

  it("enables the write tool via flag or env in both modes", () => {
    const viaFlag = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1", "--allow-write"],
      env: emptyEnv,
    });
    expect(viaFlag.mode).toBe("standalone");
    expect(viaFlag.mode === "standalone" && viaFlag.allowWrite).toBe(true);

    const viaEnvOne = resolveMcpServeOptions({
      argv: ["--host", "codex"],
      env: { GOODMEMORY_MCP_ALLOW_WRITE: "1" },
    });
    expect(viaEnvOne.mode === "installed" && viaEnvOne.allowWrite).toBe(true);

    const viaEnvTrue = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1"],
      env: { GOODMEMORY_MCP_ALLOW_WRITE: "true" },
    });
    expect(viaEnvTrue.mode === "standalone" && viaEnvTrue.allowWrite).toBe(true);

    const disabled = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1"],
      env: { GOODMEMORY_MCP_ALLOW_WRITE: "0" },
    });
    expect(disabled.mode === "standalone" && disabled.allowWrite).toBe(false);
  });

  it("accepts the CLI ParsedFlags record form as equivalent to argv", () => {
    const fromFlags = resolveMcpServeOptions({
      env: { GOODMEMORY_HOME: "/tmp/gm-home" },
      flags: {
        "allow-write": "true",
        standalone: "true",
        "user-id": "u-1",
      },
    });
    const fromArgv = resolveMcpServeOptions({
      argv: ["--standalone", "--user-id", "u-1", "--allow-write"],
      env: { GOODMEMORY_HOME: "/tmp/gm-home" },
    });
    expect(fromFlags).toEqual(fromArgv);

    const installedFromFlags = resolveMcpServeOptions({
      env: emptyEnv,
      flags: { host: "claude" },
    });
    expect(installedFromFlags).toEqual({
      allowWrite: false,
      host: "claude",
      mode: "installed",
    });
  });
});
