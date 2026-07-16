import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  parseC3HostPreflightEvidence,
  serializeC3HostPreflightEvidence,
} from "../../scripts/codex-coding-effect/c3-host-preflight";

const SHA256 = "a".repeat(64);
const COMMIT = "b".repeat(40);
const TREE = "c".repeat(40);

describe("Codex coding-effect C3 host preflight", () => {
  it("requires the complete frozen host and toolchain identity", () => {
    const evidence = validEvidence();
    expect(parseC3HostPreflightEvidence(evidence)).toEqual(evidence);
    expect(serializeC3HostPreflightEvidence(evidence)).toBe(
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
  });

  it("rejects hooks or network drift between the frozen arms", () => {
    const evidence = validEvidence();
    expect(() => parseC3HostPreflightEvidence({
      ...evidence,
      codex: {
        ...evidence.codex,
        features: {
          ...evidence.codex.features,
          noMemory: {
            ...evidence.codex.features.noMemory,
            hooks: { enabled: true, maturity: "stable" },
          },
        },
      },
    })).toThrow("invalid C3 host preflight");
    const forgedRaw =
      "hooks stable true\nmemories experimental true\n";
    expect(() => parseC3HostPreflightEvidence({
      ...evidence,
      codex: {
        ...evidence.codex,
        features: {
          ...evidence.codex.features,
          goodmemoryInstalled: {
            ...evidence.codex.features.goodmemoryInstalled,
            outputSha256: sha256(forgedRaw),
            rawOutput: forgedRaw,
          },
        },
      },
    })).toThrow("invalid C3 host preflight");
    expect(() => parseC3HostPreflightEvidence({
      ...evidence,
      networkMode: "enabled",
    })).toThrow("invalid C3 host preflight");
    expect(() => parseC3HostPreflightEvidence({
      ...evidence,
      codex: {
        ...evidence.codex,
        features: {
          ...evidence.codex.features,
          goodmemoryInstalled: {
            ...evidence.codex.features.goodmemoryInstalled,
            memories: { enabled: true, maturity: "experimental" },
          },
        },
      },
    })).toThrow("invalid C3 host preflight");
  });
});

function validEvidence() {
  return {
    codex: {
      executablePath: "/opt/codex/bin/codex",
      executableSha256: SHA256,
      features: {
        goodmemoryInstalled: {
          hooks: { enabled: true, maturity: "stable" },
          memories: { enabled: false, maturity: "experimental" },
          outputSha256: sha256(
            "hooks stable true\nmemories experimental false\n",
          ),
          rawOutput: "hooks stable true\nmemories experimental false\n",
        },
        noMemory: {
          hooks: { enabled: false, maturity: "stable" },
          memories: { enabled: false, maturity: "experimental" },
          outputSha256: sha256(
            "hooks stable false\nmemories experimental false\n",
          ),
          rawOutput: "hooks stable false\nmemories experimental false\n",
        },
      },
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      version: "codex-cli 0.144.3",
    },
    goodmemory: {
      configSha256: SHA256,
      executablePath: "/tmp/prefix/bin/goodmemory",
      executableSha256: SHA256,
      hooksSha256: SHA256,
      mcpExecutablePath: "/tmp/prefix/bin/goodmemory-mcp",
      mcpExecutableSha256: SHA256,
      packageSha256: SHA256,
      version: "goodmemory 0.5.1",
    },
    hostConfigurationsSha256: SHA256,
    networkMode: "disabled",
    paths: {
      goodmemoryInstalled: {
        codexHome: "/tmp/installed/.codex",
        home: "/tmp/installed",
        result: "/tmp/result/installed",
        runtime: "/tmp/runtime/installed",
        workspace: "/tmp/workspace/installed",
      },
      noMemory: {
        codexHome: "/tmp/no-memory/.codex",
        home: "/tmp/no-memory",
        result: "/tmp/result/no-memory",
        runtime: "/tmp/runtime/no-memory",
        workspace: "/tmp/workspace/no-memory",
      },
    },
    platform: {
      arch: "arm64",
      cpuCount: 10,
      name: "darwin",
      totalMemoryBytes: 32_000_000_000,
    },
    repository: {
      commit: COMMIT,
      dirtyStatePolicy: "reject",
      tree: TREE,
    },
    schemaVersion: 1,
    toolchain: {
      bun: { executablePath: "/opt/bun/bin/bun", sha256: SHA256, version: "1.3.11" },
      git: { executablePath: "/usr/bin/git", sha256: SHA256, version: "git version 2.50.1" },
      node: { executablePath: "/opt/node/bin/node", sha256: SHA256, version: "v22.14.0" },
      npm: { executablePath: "/opt/node/bin/npm", sha256: SHA256, version: "10.9.2" },
      python: { executablePath: "/usr/bin/python3", sha256: SHA256, version: "Python 3.13.2" },
    },
  } as const;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
